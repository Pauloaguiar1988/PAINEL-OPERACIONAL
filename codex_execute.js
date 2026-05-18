const fs = require('fs');
const path = require('path');

const folders = [
    'src/routes',
    'src/services',
    'src/controllers',
    'src/config',
    'ia/prompts',
    'data'
];

console.log("🛠️  Iniciando Protocolo de Execução Codex - Opção A...");

// 1. Criação de Pastas
folders.forEach(folder => {
    const dir = path.join(__dirname, folder);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Pasta criada: ${folder}`);
    }
});

// 2. Geração do arquivo .env (Hardening)
const envContent = `PORT=5000\nNODE_ENV=development\nDB_HOST=localhost\n# Adicione suas credenciais aqui`;
fs.writeFileSync('.env', envContent);

// 3. Geração do NOVO server.js (Bootstrap Limpo)
const serverJs = `require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('🚀 Painel Operacional Ativo na Porta ' + PORT));`;

fs.writeFileSync('server.js', serverJs);

// 4. Geração do aiService.js (O Coração da IA)
const aiService = `const aiService = {
    analisarOS: async (dados) => { return { status: 'sucesso', msg: 'Motor de IA Pronto' }; },
    gerarLaudo: async (dados) => { return { status: 'gerando' }; }
};
module.exports = aiService;`;

fs.writeFileSync('src/services/aiService.js', aiService);

// 5. Geração das Rotas de API
const apiRoutes = `const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');

router.get('/health', (req, res) => res.json({ officialRootMatch: true, status: 'OK' }));
router.post('/ai/analisar-os', async (req, res) => {
    const result = await aiService.analisarOS(req.body);
    res.json(result);
});

module.exports = router;`;

fs.writeFileSync('src/routes/api.js', apiRoutes);

console.log("🎯 Execução Concluída. Seu projeto agora segue o padrão Codex.");
console.log("👉 Próximo passo: node server.js");
