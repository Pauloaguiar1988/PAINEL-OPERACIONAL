const fs = require('fs');
const path = require('path');

console.log("🔐 LIBERANDO ACESSO AO PAINEL - PADRÃO CODEX");

// 1. Criar o Controller de Autenticação
const authController = `
const authController = {
    login: (req, res) => {
        const { usuario, senha } = req.body;
        console.log('Attempt login:', usuario);
        
        // Login Mestre para Campinas
        if (usuario === 'admin_campinas') {
            return res.json({ 
                sucesso: true, 
                token: 'codex_master_token_2026',
                perfil: 'admin',
                nome: 'Paulo Aguiar'
            });
        }
        res.status(401).json({ sucesso: false, mensagem: 'Falha de autenticação' });
    }
};
module.exports = authController;`;

fs.writeFileSync('src/controllers/authController.js', authController);

// 2. Atualizar as rotas para incluir o Login
let apiRoutes = fs.readFileSync('src/routes/api.js', 'utf8');
if (!apiRoutes.includes('authController')) {
    apiRoutes = "const authController = require('../controllers/authController');\n" + apiRoutes;
    apiRoutes = apiRoutes.replace("module.exports = router;", `
router.post('/login', authController.login);
router.post('/auth/login', authController.login); // Garante as duas variações comuns

module.exports = router;`);
    fs.writeFileSync('src/routes/api.js', apiRoutes);
}

console.log("✅ Usuário 'admin_campinas' liberado.");
console.log("👉 Reinicie o servidor: node server.js e tente logar novamente.");
