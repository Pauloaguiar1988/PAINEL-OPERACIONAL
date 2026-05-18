const fs = require('fs');
const path = require('path');

console.log("📊 SINCRONIZANDO DASHBOARD VISUAL - PADRÃO CODEX");

const appJsPath = path.join(__dirname, 'app.js');

if (fs.existsSync(appJsPath)) {
    let content = fs.readFileSync(appJsPath, 'utf8');

    // Injeta a função de atualização de dashboard compatível com o novo BI
    const novaLogicaDash = `
function atualizarDashboardCodex() {
    fetch('/api/dashboard/resumo')
        .then(res => res.json())
        .then(dados => {
            console.log("Dados BI recebidos:", dados);
            
            // Soma todos os valores do objeto (Faturável + Dano + etc)
            const totalGeral = Object.values(dados).reduce((a, b) => a + b, 0);
            const faturaveis = (dados["Faturável"] || 0) + (dados["Faturável (Dano)"] || 0);

            // Tenta atualizar os elementos por ID ou por seletor de texto (CCOI padrão)
            const elTotal = document.getElementById('total-analisadas') || document.querySelector('.card:nth-child(1) h1');
            const elFaturavel = document.getElementById('total-faturavel') || document.querySelector('.card:nth-child(2) h1');

            if(elTotal) elTotal.innerText = totalGeral;
            if(elFaturavel) elFaturavel.innerText = faturaveis;
        })
        .catch(err => console.error("Erro ao carregar BI:", err));
}
// Executa ao carregar
setInterval(atualizarDashboardCodex, 5000); 
atualizarDashboardCodex();
`;

    // Adiciona ao final do arquivo sem apagar o que já existe
    fs.appendFileSync(appJsPath, novaLogicaDash);
    console.log("✅ Lógica de exibição injetada no app.js");
} else {
    console.log("❌ Erro: app.js não encontrado na raiz.");
}

console.log("\n👉 PASSO FINAL: Reinicie o servidor (node server.js) e dê um CTRL+F5 no navegador.");
