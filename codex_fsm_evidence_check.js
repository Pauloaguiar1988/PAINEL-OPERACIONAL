const fs = require('fs');
const path = require('path');

console.log('GERANDO EVIDENCIA DE CALCULO PARA CLIENTES CRITICOS...');

const auditPath = path.join(__dirname, 'data', 'auditoria.json');
const outputPath = path.join(__dirname, 'data', 'evidence_bosch_risco.txt');

if (!fs.existsSync(auditPath)) {
    throw new Error('data/auditoria.json nao encontrado.');
}

const dados = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const bosch = dados.filter(d => String(d.cliente || '').toUpperCase().includes('BOSCH'));

function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function isRecurrent(os) {
    return os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1;
}

const faturamento = bosch.reduce((acc, d) => acc + Number(d.valorEstimado || 0), 0);
const reincidentes = bosch.filter(isRecurrent);
const perdaFinanceira = reincidentes.length * 281;
const impactoMargem = faturamento > 0 ? (perdaFinanceira / faturamento) * 100 : 0;
const ftf = bosch.length > 0 ? ((bosch.length - reincidentes.length) / bosch.length) * 100 : 100;

const analise = {
    totalOS: bosch.length,
    faturaveis: bosch.filter(d => d.classificacao === 'Faturável').length,
    garantias: bosch.filter(d => d.classificacao === 'Garantia').length,
    reincidentes: reincidentes.length,
    faturamento,
    perdaFinanceira,
    impactoMargem,
    ftf
};

const linhasOS = bosch
    .sort((a, b) => String(a.os_numero || '').localeCompare(String(b.os_numero || '')))
    .map(d => {
        const recorrente = isRecurrent(d) ? 'SIM' : 'NAO';
        return [
            `OS: ${d.os_numero || 'S/N'}`,
            `Tecnico: ${d.tecnico || 'N/A'}`,
            `Classificacao: ${d.classificacao || 'N/A'}`,
            `Valor: ${moeda(d.valorEstimado)}`,
            `Reincidente: ${recorrente}`,
            `Risco: ${d.riskLevel || 'N/A'}`,
            `Serial: ${d.serial || 'S/N'}`,
            `Recomendacao: ${d.recommendation || 'N/A'}`
        ].join(' | ');
    });

const report = [
    '-------------------------------------------',
    'LAUDO DE AUDITORIA: ROBERT BOSCH',
    '-------------------------------------------',
    `Total de Atendimentos: ${analise.totalOS}`,
    `Faturados: ${analise.faturaveis} | Garantias/Retornos: ${analise.garantias}`,
    `Visitas de Reincidencia: ${analise.reincidentes}`,
    `FTF Cliente: ${analise.ftf.toFixed(1)}%`,
    `Faturamento Gerado: ${moeda(analise.faturamento)}`,
    `Custo de Deslocamento Perdido: ${moeda(analise.perdaFinanceira)}`,
    `Impacto na Margem: ${analise.impactoMargem.toFixed(1)}%`,
    '-------------------------------------------',
    'DETALHE OS POR OS',
    '-------------------------------------------',
    ...linhasOS,
    '-------------------------------------------',
    `CONCLUSAO: O risco de ${analise.impactoMargem.toFixed(1)}% e real porque ${moeda(analise.perdaFinanceira)} em visitas reincidentes consome parcela relevante do faturamento de ${moeda(analise.faturamento)} no cliente.`,
    'ACAO SUGERIDA: tratar ROBERT BOSCH como zona de atrito operacional, revisar infraestrutura/ambiente e negociar regra de visita improdutiva ou plano corretivo dedicado.',
    '-------------------------------------------'
].join('\n');

fs.writeFileSync(outputPath, report, 'utf8');

console.log(report);
console.log(`\nArquivo de evidencia gerado em: ${outputPath}`);
