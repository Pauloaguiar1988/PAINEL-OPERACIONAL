const fs = require('fs');
const path = require('path');

console.log("🛠️ INICIANDO RESTAURO INTEGRAL DE DADOS - PADRÃO CODEX");

// 1. Atualizar o src/services/analyticsService.js para entregar a lista detalhada de O.S.
const analyticsExpanded = `const fs = require('fs');
const path = require('path');
const { poolPromise } = require('../config/database');

const analyticsService = {
    async obterTabelaCompleta() {
        const logPath = path.join(__dirname, '../../data/auditoria.json');
        if (!fs.existsSync(logPath)) return [];
        const linhas = fs.readFileSync(logPath, 'utf8').trim().split('\\n');
        return linhas.map(l => JSON.parse(l));
    },
    async obterResumo() {
        const dados = await this.obterTabelaCompleta();
        return dados.reduce((acc, curr) => {
            acc[curr.classificacao] = (acc[curr.classificacao] || 0) + 1;
            return acc;
        }, {});
    }
};
module.exports = analyticsService;`;

fs.writeFileSync('src/services/analyticsService.js', analyticsExpanded);

// 2. Criar a nova rota para alimentar as tabelas do Front
let apiRoutes = fs.readFileSync('src/routes/api.js', 'utf8');
if (!apiRoutes.includes('/dashboard/tabela')) {
    apiRoutes = apiRoutes.replace('module.exports = router;', `
router.get('/dashboard/tabela', async (req, res) => {
    const dados = await analyticsService.obterTabelaCompleta();
    res.json(dados);
});\n\nmodule.exports = router;`);
    fs.writeFileSync('src/routes/api.js', apiRoutes);
}

// 3. Injetar o "Alimentador de Tabelas" no app.js
const frontFix = `
function renderizarTabelasCodex() {
    fetch('/api/dashboard/tabela')
        .then(res => res.json())
        .then(dados => {
            console.log("📦 Codex: Alimentando tabelas com", dados.length, "registos");
            const corpoTabela = document.querySelector('#tabela-os-detalhe tbody') || document.querySelector('.os-grid');
            if(corpoTabela) {
                corpoTabela.innerHTML = dados.map(os => \`
                    <tr>
                        <td>\${os.os_numero || 'S/N'}</td>
                        <td>\${os.tecnico}</td>
                        <td>\${os.causaProvavel}</td>
                        <td><span class="badge">\${os.classificacao}</span></td>
                    </tr>
                \`).join('');
            }
        });
}
// Chamar ao carregar
setTimeout(renderizarTabelasCodex, 2000);
`;

fs.appendFileSync('app.js', frontFix);

console.log("✅ Tabelas religadas. Agora o frontend vai ler os ficheiros das pastas.");
