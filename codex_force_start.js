const { exec } = require('child_process');
const os = require('os');

console.log("⚠️  FORÇANDO INICIALIZAÇÃO DO ECOSSISTEMA...");

// 1. Comando para matar processos na porta 5000 (Windows)
const killCmd = "stop-process -id (get-nettcpconnection -localport 5000).owningprocess -force";

exec(`powershell "${killCmd}"`, (err) => {
    console.log("🧹 Limpeza de portas concluída (se havia algo preso, foi removido).");

    // 2. Iniciar o servidor de fato
    const server = exec('node server.js');

    server.stdout.on('data', (data) => {
        console.log(`[SERVER]: ${data.trim()}`);
        if (data.includes('5000')) {
            console.log("\n🚀 SERVIDOR CONFIRMADO. Tentando abrir o navegador...");
            // Abrir navegador automaticamente
            const startCmd = os.platform() === 'win32' ? 'start' : 'open';
            exec(`${startCmd} http://localhost:5000`);
        }
    });

    server.stderr.on('data', (data) => {
        console.error(`\n❌ ERRO NO SERVER: ${data}`);
    });
});
