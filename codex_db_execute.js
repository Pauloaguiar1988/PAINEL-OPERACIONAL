const fs = require('fs');
const path = require('path');

console.log("🗄️  Iniciando Protocolo de Execução Codex - Opção B...");

// 1. Criar o Config de Banco de Dados
const dbConfig = `const mssql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const poolPromise = new mssql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Conectado ao SQL Server');
        return pool;
    })
    .catch(err => {
        console.log('⚠️ Falha no SQL Server, utilizando Fallback JSON:', err.message);
        return null;
    });

module.exports = { mssql, poolPromise };`;

fs.writeFileSync('src/config/database.js', dbConfig);

// 2. Criar o Data Service (A inteligência de persistência)
const dataService = `const fs = require('fs');
const path = require('path');
const { poolPromise } = require('../config/database');

const dataService = {
    async salvarRegistro(colecao, dados) {
        const pool = await poolPromise;
        if (pool) {
            // Lógica para salvar no SQL Server
            // Ex: await pool.request().query('INSERT INTO...');
            return { storage: 'sql' };
        } else {
            // Fallback para JSON
            const filePath = path.join(__dirname, '../../data', \`\${colecao}.json\`);
            fs.appendFileSync(filePath, JSON.stringify(dados) + '\\n');
            return { storage: 'json' };
        }
    }
};
module.exports = dataService;`;

fs.writeFileSync('src/services/dataService.js', dataService);

// 3. Gerar o Script SQL de Criação (Para você rodar no banco)
const sqlScript = `-- SCRIPT DE CRIAÇÃO - PAINEL OPERACIONAL
CREATE TABLE Operacoes (
    id INT PRIMARY KEY IDENTITY(1,1),
    data_registro DATETIME DEFAULT GETDATE(),
    tecnico VARCHAR(100),
    os_numero VARCHAR(50),
    status_ia VARCHAR(50),
    classificacao_cobranca VARCHAR(50),
    risco_score FLOAT
);
-- Adicione as demais tabelas conforme a taxonomia técnica`;

fs.writeFileSync('create_tables.sql', sqlScript);

console.log("✅ Configurações de Banco e Fallback injetadas com sucesso.");
console.log("👉 IMPORTANTE: Instale a dependência do SQL: npm install mssql");
console.log("👉 O script SQL para o seu banco foi gerado em: create_tables.sql");
