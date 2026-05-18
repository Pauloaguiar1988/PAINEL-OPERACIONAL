const fs = require('fs');
const { exec } = require('child_process');

console.log("🛠️  EXECUTANDO REPARO TOTAL - PADRÃO CODEX");

async function fixAll() {
    // 1. Verificar se o app.js (frontend) está enviando para o lugar certo
    if (fs.existsSync('app.js')) {
        let appJs = fs.readFileSync('app.js', 'utf8');
        // Se o app.js chama fetch('/ai/...'), mudamos para fetch('/api/ai/...')
        const novoAppJs = appJs.replace(/fetch\(['"]\/(?!(api\/))/g, "fetch('/api/");
        fs.writeFileSync('app.js', novoAppJs);
        console.log("✅ URLs do Frontend (app.js) sincronizadas com o Backend.");
    }

    // 2. Tentar subir o servidor e capturar erros reais
    console.log("⏳ Testando inicialização do servidor...");
    const serverProcess = exec('node server.js');

    serverProcess.stdout.on('data', (data) => {
        if (data.includes('Porta')) {
            console.log("\n🚀 SUCESSO: O sistema está online em http://localhost:5000");
            process.exit();
        }
    });

    serverProcess.stderr.on('data', (data) => {
        console.log("\n❌ ERRO DETECTADO:");
        if (data.includes('EADDRINUSE')) {
            console.log("   -> A porta 5000 está ocupada por outro processo. Feche o Node antigo.");
        } else if (data.includes('Cannot find module')) {
            const mod = data.split("'")[1];
            console.log(`   -> Falta instalar o módulo: npm install ${mod}`);
        } else {
            console.log("   -> " + data.trim());
        }
        process.exit();
    });
}

fixAll();
