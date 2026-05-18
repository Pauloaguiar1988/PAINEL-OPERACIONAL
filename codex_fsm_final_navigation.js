const fs = require('fs');
const path = require('path');

console.log('ATIVANDO NAVEGACAO DINAMICA E CARREGAMENTO DE ABAS...');

const appPath = path.join(__dirname, 'app.js');

const finalNavigationJs = `
const ABAS_FSM = {
    'painel-do-dia': 'Painel do Dia',
    'operacao': 'Operação',
    'analise-tecnica': 'Análise Técnica',
    'tecnicos': 'Técnicos',
    'clientes': 'Clientes',
    'laudo-qualidade': 'Laudo & Qualidade',
    'governanca': 'Governança'
};

function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function slug(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function byId(id) {
    return document.getElementById(id);
}

function isRetorno(os) {
    return os.isRecurrent === true || os.classificacao === 'Garantia Serviço';
}

function ensureShell() {
    let nav = byId('fsm-dynamic-nav');
    let content = byId('fsm-dynamic-content');

    if (!nav) {
        const host = document.querySelector('aside') || document.querySelector('nav') || document.body;
        nav = document.createElement('div');
        nav.id = 'fsm-dynamic-nav';
        nav.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; padding:10px;';
        nav.innerHTML = Object.entries(ABAS_FSM).map(([id, label]) =>
            '<button class="menu-item" data-aba="' + id + '" style="padding:7px 10px; border:1px solid #334155; background:#0f172a; color:#e5e7eb; border-radius:4px; cursor:pointer;">' + label + '</button>'
        ).join('');
        host.prepend(nav);
    }

    if (!content) {
        const mainTable = document.querySelector('#gm-main-table');
        const parent = mainTable ? mainTable.parentElement : null;
        content = document.createElement('main');
        content.id = 'fsm-dynamic-content';
        content.className = 'view-area';
        content.style.cssText = 'padding:16px; width:100%;';

        if (parent) {
            parent.innerHTML = '';
            parent.appendChild(content);
        } else {
            document.body.appendChild(content);
        }
    }

    return { nav, content };
}

async function buscarDadosFSM() {
    const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
    const dados = await res.json();
    return Array.isArray(dados) ? dados : [];
}

function atualizarWidgetsLaterais(dados) {
    const faturamento = dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0);
    const perda = dados.filter(d => d.classificacao === 'Garantia Serviço').length * 281;
    const total = dados.length;
    const faturaveis = dados.filter(d => d.classificacao === 'Faturável').length;
    const garantias = dados.filter(d => d.classificacao !== 'Faturável').length;

    const map = {
        gmOsRiscoEstimado: moeda(faturamento),
        gmOsTotal: total,
        gmOsFaturamento: faturaveis,
        gmOsAlertRecords: garantias
    };

    Object.entries(map).forEach(([id, value]) => {
        const el = byId(id);
        if (el) el.innerText = value;
    });

    document.querySelectorAll('.valor-faturamento').forEach(el => { el.innerText = moeda(faturamento); });
    document.querySelectorAll('.valor-perda').forEach(el => { el.innerText = moeda(perda); });

    let loss = byId('gmOsLossMetric');
    if (!loss) {
        const host = byId('fsm-dynamic-content') || document.body;
        loss = document.createElement('div');
        loss.id = 'gmOsLossMetric';
        loss.className = 'system-white-card';
        host.prepend(loss);
    }
    loss.innerHTML = '<b style="color:#ef4444">' + moeda(perda) + '</b><br><small>Perda por Garantia Serviço</small>';
}

function groupByCount(dados, fn) {
    return dados.reduce((acc, item) => {
        const key = fn(item);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function bar(label, qtd, total, color) {
    const pct = total ? Math.round((qtd / total) * 100) : 0;
    return '<div style="margin:10px 0;"><div style="display:flex; justify-content:space-between;"><span>' + label + '</span><b>' + qtd + ' OS (' + pct + '%)</b></div><div style="height:8px; background:#0f172a; border-radius:5px; overflow:hidden;"><div style="width:' + pct + '%; height:100%; background:' + color + ';"></div></div></div>';
}

function renderPainelDia(content, dados) {
    const faturamento = dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0);
    const perda = dados.filter(d => d.classificacao === 'Garantia Serviço').length * 281;
    const criticos = dados.filter(d => d.riskLevel === 'critical').length;
    const causas = groupByCount(dados, d => d.probableCause || 'sem_diagnostico');

    content.innerHTML = '<section style="color:#e5e7eb;"><h2>Painel do Dia</h2>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px;">' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>Faturamento</small><h3>' + moeda(faturamento) + '</h3></div>' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>Perda Serviço</small><h3 style="color:#ef4444">' + moeda(perda) + '</h3></div>' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>OS Críticas</small><h3>' + criticos + '</h3></div>' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>Total OS</small><h3>' + dados.length + '</h3></div>' +
        '</div><div style="background:#1e293b; padding:16px; border-radius:8px; margin-top:14px;"><h3>Causa Raiz</h3>' +
        bar('Comunicação/Rede', causas.falha_comunicacao || 0, dados.length, '#3b82f6') +
        bar('Hardware', causas.falha_hardware || 0, dados.length, '#e879f9') +
        bar('Infraestrutura Cliente', causas.infraestrutura_cliente || 0, dados.length, '#ef4444') +
        bar('Ajuste/Configuração', causas.ajuste_configuracao || 0, dados.length, '#10b981') +
        '</div></section>';
}

function renderOperacao(content, dados) {
    content.innerHTML = '<section style="color:#e5e7eb;"><h2>Operação</h2><table style="width:100%; border-collapse:collapse;"><tbody>' +
        dados.slice(-60).reverse().map(os => '<tr style="border-bottom:1px solid #334155; border-left:4px solid ' + (os.riskLevel === 'critical' ? '#ef4444' : '#3b82f6') + ';"><td style="padding:8px;"><b>' + (os.os_numero || 'S/N') + '</b></td><td>' + (os.tecnico || 'N/A') + '</td><td>' + (os.cliente || 'Cliente') + '</td><td>' + (os.classificacao || 'N/A') + '<br><small>' + (os.probableCause || 'sem_diagnostico') + '</small></td><td style="text-align:right;">' + moeda(os.valorEstimado) + '</td></tr>').join('') +
        '</tbody></table></section>';
}

function renderAnaliseTecnica(content, dados) {
    const causas = groupByCount(dados, d => d.probableCause || 'sem_diagnostico');
    const pecas = {};
    dados.forEach(d => (d.pecas || []).forEach(p => { pecas[p] = (pecas[p] || 0) + 1; }));

    content.innerHTML = '<section style="color:#e5e7eb;"><h2>Análise Técnica</h2>' +
        '<div id="inteligencia-equipamento" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px;">' +
        Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([c, qtd]) => '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>' + c.replace(/_/g, ' ').toUpperCase() + '</small><h3>' + qtd + ' OS</h3></div>').join('') +
        '</div><h3 style="margin-top:18px;">Top Peças</h3>' +
        Object.entries(pecas).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, q]) => '<div style="display:flex; justify-content:space-between; background:#1e293b; padding:8px; margin-bottom:6px; border-radius:4px;"><span>' + p + '</span><b>' + q + ' un</b></div>').join('') +
        '</section>';
}

function renderTecnicos(content, dados) {
    const techs = {};
    dados.forEach(d => {
        const t = d.tecnico || 'N/A';
        if (!techs[t]) techs[t] = { total: 0, retornos: 0, faturamento: 0 };
        techs[t].total += 1;
        techs[t].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) techs[t].retornos += 1;
    });

    content.innerHTML = '<section style="color:#e5e7eb;"><h2>Técnicos</h2><table style="width:100%; border-collapse:collapse;"><tbody id="tabela-tecnicos-corpo">' +
        Object.entries(techs).sort((a, b) => b[1].faturamento - a[1].faturamento).map(([nome, s]) => {
            const ftf = s.total ? ((s.total - s.retornos) / s.total) * 100 : 100;
            return '<tr style="border-bottom:1px solid #334155;"><td style="padding:10px;"><b>' + nome + '</b><br><small>' + s.total + ' OS</small></td><td>' + ftf.toFixed(1) + '% FTF</td><td>' + s.retornos + ' retornos</td><td style="text-align:right;">' + moeda(s.faturamento) + '</td></tr>';
        }).join('') + '</tbody></table></section>';
}

function renderClientes(content, dados) {
    const clients = {};
    dados.forEach(d => {
        const c = d.cliente || 'N/A';
        if (!clients[c]) clients[c] = { total: 0, perda: 0, faturamento: 0 };
        clients[c].total += 1;
        clients[c].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) clients[c].perda += 281;
    });

    content.innerHTML = '<section style="color:#e5e7eb;"><h2>Clientes</h2><div id="aba-clientes-risco">' +
        Object.entries(clients).filter(([, s]) => s.perda > 0).sort((a, b) => b[1].perda - a[1].perda).slice(0, 12).map(([nome, s]) => {
            const impacto = s.faturamento ? (s.perda / s.faturamento) * 100 : 0;
            return '<div style="background:#1e293b; padding:12px; border-left:4px solid #ef4444; margin-bottom:8px; border-radius:4px;"><b>' + nome + '</b><br><small>' + s.total + ' OS | Impacto ' + impacto.toFixed(1) + '%</small><div style="display:flex; justify-content:space-between;"><span>' + moeda(s.faturamento) + '</span><b style="color:#ef4444">-' + moeda(s.perda) + '</b></div></div>';
        }).join('') + '</div></section>';
}

function renderGovernanca(content, dados) {
    const fila = dados.filter(d => d.riskLevel === 'critical' || Number(d.confidence || 0) < 85);
    const criticos = dados.filter(d => d.riskLevel === 'critical').length;
    const auditados = dados.filter(d => d.auditStatus === 'reviewed' || (d.governance && d.governance.status === 'reviewed')).length;
    const saude = criticos ? Math.round((Math.min(auditados, criticos) / criticos) * 100) : 100;

    content.innerHTML = '<section style="color:#e5e7eb;"><h2>Governança</h2><div id="saude-governanca" style="background:#1e293b; padding:14px; border-radius:8px; margin-bottom:12px;"><small>Saúde da Governança</small><h3>' + saude + '%</h3></div><div id="fila-revisao-fsm">' +
        fila.slice(0, 50).map(os => '<div style="background:#1e293b; padding:10px; border-left:4px solid #ef4444; margin-bottom:6px;"><b>' + (os.os_numero || 'S/N') + '</b> - ' + (os.cliente || 'Cliente') + '<br><small>' + (os.recommendation || 'Sem recomendação') + '</small></div>').join('') +
        '</div></section>';
}

async function carregarDadosAba(aba) {
    const { content } = ensureShell();
    const dados = await buscarDadosFSM();
    atualizarWidgetsLaterais(dados);

    if (aba === 'operacao') return renderOperacao(content, dados);
    if (aba === 'analise-tecnica') return renderAnaliseTecnica(content, dados);
    if (aba === 'tecnicos') return renderTecnicos(content, dados);
    if (aba === 'clientes') return renderClientes(content, dados);
    if (aba === 'laudo-qualidade' || aba === 'governanca') return renderGovernanca(content, dados);
    return renderPainelDia(content, dados);
}

function navegarPara(abaId) {
    const aba = ABAS_FSM[abaId] ? abaId : slug(abaId);
    console.log('Navegando para:', aba);

    document.querySelectorAll('[data-aba], .menu-item').forEach(item => {
        const itemAba = item.getAttribute('data-aba') || slug(item.innerText);
        item.classList.toggle('active', itemAba === aba);
    });

    carregarDadosAba(aba);
}

document.addEventListener('click', event => {
    const item = event.target.closest('[data-aba]') || event.target.closest('.menu-item');
    if (!item) return;

    const aba = item.getAttribute('data-aba') || slug(item.innerText);
    if (ABAS_FSM[aba]) {
        event.preventDefault();
        navegarPara(aba);
    }
});

window.onload = function() {
    ensureShell();
    navegarPara('painel-do-dia');
};
`;

fs.writeFileSync(appPath, finalNavigationJs, 'utf8');
console.log('Navegacao Corrigida. As abas agora sao independentes e os dados sobem sob demanda.');
