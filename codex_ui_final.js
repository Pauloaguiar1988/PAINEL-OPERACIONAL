const fs = require('fs');
const path = require('path');

console.log("✨ CONSOLIDANDO INTERFACE FINAL - PADRÃO PAULO AGUIAR");

// 1. Refatoração Completa do app.js
const appJsConsolidado = `
// Motor de Interface Codex - Versão Consolidada
async function atualizarTudo() {
    try {
        const [resResumo, resTabela] = await Promise.all([
            fetch('/api/dashboard/resumo'),
            fetch('/api/dashboard/tabela')
        ]);
        
        const resumo = await resResumo.json();
        const tabela = await resTabela.json();

        // 1. Atualizar Contadores do Topo (Cards)
        document.querySelectorAll('#gmOsTotal, .card:nth-child(1) h1').forEach(el => el.innerText = tabela.length);
        
        const faturaveis = (resumo["Faturável"] || 0) + (resumo["Faturável (Dano)"] || 0);
        document.querySelectorAll('#gmOsFaturamento, .card:nth-child(2) h1').forEach(el => el.innerText = faturaveis);

        // 2. Popular Tabela de Operação
        const corpo = document.querySelector('#gm-main-table tbody') || document.querySelector('.os-grid tbody');
        if (corpo) {
            corpo.innerHTML = tabela.slice(-15).reverse().map(os => \`
                <tr>
                    <td>\${os.os_numero}</td>
                    <td>\${os.tecnico}</td>
                    <td>\${os.classificacao}</td>
                    <td><span class="status-badge \${os.classificacao === 'Garantia' ? 'warn' : 'success'}">
                        \${os.probable_cause || 'Analisado'}
                    </span></td>
                </tr>
            \`).join('');
        }
        
        console.log("📊 Painel Sincronizado: " + tabela.length + " registros.");
    } catch (e) {
        console.error("Erro na sincronia Codex:", e);
    }
}

// Inicialização
window.addEventListener('load', () => {
    atualizarTudo();
    setInterval(atualizarTudo, 30000); // Atualiza a cada 30s
});
`;

fs.writeFileSync('app.js', appJsConsolidado);

console.log("✅ app.js limpo e otimizado.");
console.log("👉 Reinicie o servidor: node server.js");
console.log("🎯 RESULTADO: Seu sistema agora lê PDF, consulta preço e atualiza o grid sozinho.");
