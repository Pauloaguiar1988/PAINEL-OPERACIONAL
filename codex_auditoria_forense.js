const fs = require('fs');
const path = require('path');

console.log('INICIANDO AUDITORIA FORENSE DE ATIVOS - TAGUS-TEC');

const AUDITORIA_PATH = path.join(__dirname, 'data', 'auditoria.json');

if (!fs.existsSync(AUDITORIA_PATH)) {
    throw new Error('data/auditoria.json nao encontrado.');
}

const dados = JSON.parse(fs.readFileSync(AUDITORIA_PATH, 'utf8'));
const clientesAlvo = ['ROBERT BOSCH', 'ANHANGUERA'];

function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function isRecurrent(os) {
    return os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1;
}

function dataOs(os) {
    return os.dataAnalise || os.data_registro || os.data || 'sem-data';
}

function calcularFtfPorTecnico(base) {
    const stats = {};
    base.forEach(os => {
        const tecnico = os.tecnico || 'N/A';
        if (!stats[tecnico]) stats[tecnico] = { total: 0, retornos: 0 };
        stats[tecnico].total += 1;
        if (isRecurrent(os)) stats[tecnico].retornos += 1;
    });

    return stats;
}

function ftfTexto(stats, tecnico) {
    const stat = stats[tecnico || 'N/A'];
    if (!stat || !stat.total) return '100.0%';
    return (((stat.total - stat.retornos) / stat.total) * 100).toFixed(1) + '%';
}

clientesAlvo.forEach(target => {
    console.log('\n========================================================');
    console.log(`LAUDO TECNICO-FINANCEIRO: ${target}`);
    console.log('========================================================');

    const historico = dados
        .filter(d => String(d.cliente || '').toUpperCase().includes(target))
        .sort((a, b) => String(dataOs(a)).localeCompare(String(dataOs(b))));

    const seriais = {};
    historico.forEach(os => {
        const serial = os.serial || 'S/N';
        if (!seriais[serial]) {
            seriais[serial] = { total: 0, tecnicos: new Set(), faturado: 0, custo: 0, os: [] };
        }

        seriais[serial].total += 1;
        seriais[serial].tecnicos.add(os.tecnico || 'N/A');
        seriais[serial].faturado += Number(os.valorEstimado || 0);
        if (isRecurrent(os)) seriais[serial].custo += 281;
        seriais[serial].os.push(os);
    });

    const ftfClienteStats = calcularFtfPorTecnico(historico);
    const faturamento = historico.reduce((acc, item) => acc + Number(item.valorEstimado || 0), 0);
    const perda = historico.filter(isRecurrent).length * 281;
    const ftfCliente = historico.length ? (((historico.length - historico.filter(isRecurrent).length) / historico.length) * 100) : 100;

    console.log(`Volume Total: ${historico.length} O.S.`);
    console.log(`Faturamento Bruto: ${moeda(faturamento)}`);
    console.log(`Custo de Retrabalho: ${moeda(perda)}`);
    console.log(`FTF Local Cliente: ${ftfCliente.toFixed(1)}%`);

    console.log('\n--- Cronologia de Perda ---');
    historico.forEach(os => {
        const recorrente = isRecurrent(os) ? 'REINCIDENTE' : 'primeira/sem retorno';
        console.log(`${dataOs(os)} | ${os.os_numero || 'S/N'} | ${os.tecnico || 'N/A'} | FTF tecnico no cliente: ${ftfTexto(ftfClienteStats, os.tecnico)} | ${recorrente} | ${moeda(os.valorEstimado)}`);
    });

    console.log('\n--- Detalhes por Equipamento (Serial) ---');
    Object.entries(seriais)
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([sn, info]) => {
            const status = info.custo === 0 ? '100% FTF' : 'Reincidente';
            console.log(`S/N: ${sn} | Visitas: ${info.total} | Tecnicos: [${Array.from(info.tecnicos).join(', ')}]`);
            console.log(`   -> Status: ${status} | Faturado: ${moeda(info.faturado)} | Custo de Retrabalho: ${moeda(info.custo)}`);
        });

    const multiTecnicoMesmoAtivoComFalha = Object.values(seriais).some(s => s.tecnicos.size > 1 && s.custo > 0);
    const tecnicosDiferentesCliente = new Set(historico.map(os => os.tecnico || 'N/A')).size > 1;
    const baixoFtf = ftfCliente < 60;

    console.log('\n--- CONCLUSAO DA IA ---');
    if (multiTecnicoMesmoAtivoComFalha || (tecnicosDiferentesCliente && baixoFtf)) {
        console.log('DIAGNOSTICO: ZONA DE ATRITO CONFIRMADA.');
        console.log('Multiplos tecnicos e/ou ativos recorrentes indicam causa provavel em INFRAESTRUTURA/REDE/AMBIENTE DO CLIENTE.');
    } else {
        console.log('DIAGNOSTICO: FALHA DE EXECUCAO TECNICA.');
        console.log('O problema esta concentrado em atendimentos isolados ou em baixa variacao de tecnico/ativo.');
    }
});

console.log('\n========================================================');
