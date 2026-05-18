require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');

const RAIZ_PROJETO = 'C:\\Painel_Operacional_Corrigido';
const dirPath = 'C:\\Painel_Operacional_Corrigido\\data\\import\\campinas';
const DATA_DIR = path.join(RAIZ_PROJETO, 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const AUDITORIA_FILE = path.join(DATA_DIR, 'auditoria.json');
const LOG_AUDITORIA_FILE = path.join(RAIZ_PROJETO, 'log_auditoria_fsm.txt');
const UPLOADS_DIR = dirPath;
const PURE_DATA_READ = false;
const HYBRID_DATA_READ = true;

if (path.resolve(__dirname).toLowerCase() !== path.resolve(RAIZ_PROJETO).toLowerCase()) {
    console.error(`[ALERTA FSM] Servidor iniciado fora da raiz oficial. Atual: ${__dirname} | Oficial: ${RAIZ_PROJETO}`);
}

function wipeInternalCache(filePath) {
    if (!PURE_DATA_READ) return;
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '[]\n', 'utf8');
        console.log(`[PURE_DATA_READ] Cache interno limpo: ${filePath}`);
    } catch (err) {
        console.error(`[PURE_DATA_READ] Falha ao limpar cache interno ${filePath}: ${err.message}`);
    }
}

wipeInternalCache(AUDITORIA_FILE);
wipeInternalCache(RECORDS_FILE);

function logImportDirectorySnapshot() {
    console.log(`[DIRECT_PATH_OVERRIDE] dirPath absoluto: ${dirPath}`);
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        console.log(`[DIRECT_PATH_OVERRIDE] Itens encontrados em import/campinas: ${entries.length}`);
        entries.forEach((entry) => {
            const fullPath = path.join(dirPath, entry.name);
            let detail = '';
            try {
                if (entry.isFile()) detail = ` (${fs.statSync(fullPath).size} bytes)`;
            } catch (statErr) {
                detail = ` (stat indisponivel: ${statErr.message})`;
            }
            console.log(`[DIRECT_PATH_OVERRIDE] ${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}${detail}`);
        });
        const planilhas = entries
            .filter(entry => entry.isFile() && /\.(csv|xlsx|xls)$/i.test(entry.name))
            .map(entry => entry.name);
        console.log(`[DIRECT_PATH_OVERRIDE] CSV/XLSX/XLS na raiz: ${planilhas.length ? planilhas.join(', ') : 'nenhum'}`);
    } catch (err) {
        console.log(`[DIRECT_PATH_OVERRIDE] ERRO AO LISTAR ${dirPath}: ${err.message}`);
    }
}

logImportDirectorySnapshot();

const app = express();
app.use(express.json());
app.use(express.static(RAIZ_PROJETO));

app.use('/api', apiRoutes);

app.get('/', (req, res) => res.sendFile(path.join(RAIZ_PROJETO, 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('\nECOSSISTEMA OPERACIONAL CONSOLIDADO');
    console.log(`LOCAL: http://localhost:${PORT}`);
    console.log('DIRETORIA TECNICA: PAULO AGUIAR');
    console.log(`RAIZ_PROJETO: ${RAIZ_PROJETO}`);
    console.log(`PURE_DATA_READ: ${PURE_DATA_READ ? 'ATIVO - somente CSV/XLSX em import/campinas' : 'INATIVO'}`);
    console.log(`HYBRID_DATA_READ: ${HYBRID_DATA_READ ? 'ATIVO - importacao + bases internas do projeto' : 'INATIVO'}`);
    console.log(`records.json: ${RECORDS_FILE}`);
    console.log(`auditoria.json: ${AUDITORIA_FILE}`);
    console.log(`log_auditoria_fsm.txt: ${LOG_AUDITORIA_FILE}`);
    console.log(`uploads: ${UPLOADS_DIR}`);
});
