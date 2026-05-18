const fs = require('fs');
const path = require('path');

console.log('INTEGRANDO TODAS AS ABAS E REFINANDO TAXONOMIA...');

const appPath = path.join(__dirname, 'app.js');
const auditPath = path.join(__dirname, 'data', 'auditoria.json');

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function refinarTaxonomiaServidor(os) {
    const texto = normalize([
        os.descricao,
        os.texto,
        os.modelo,
        os.recommendation,
        os.sourceFile,
        os.classificacao,
        os.serial,
        (os.pecas || []).join(' ')
    ].join(' '));

    if ((os.pecas || []).length > 0 || /placa|leitor|display|fonte|sensor|cabo|catraca|terminal|biometr|coletor|rele|mecanismo/.test(texto)) {
        return 'falha_hardware';
    }

    if (/rede|comunicacao|gateway|ip|dns|vpn|firewall|offline|internet|conexao|socket|porta/.test(texto)) {
        return 'falha_comunicacao';
    }

    if (/configuracao|ajuste|software|firmware|parametro|cadastro|senha|credencial|liberacao/.test(texto)) {
        return 'ajuste_configuracao';
    }

    if (/treinamento|orientacao|operador|uso indevido|procedimento|usuario/.test(texto)) {
        return 'erro_operacional';
    }

    return 'infraestrutura_cliente';
}

function atualizarAuditoria() {
    if (!fs.existsSync(auditPath)) return;
    const dados = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const refinados = dados.map(os => ({
        ...os,
        probableCause: refinarTaxonomiaServidor(os),
        taxonomyVersion: 'multinivel-360'
    }));

    fs.writeFileSync(auditPath, JSON.stringify(refinados, null, 2), 'utf8');
}

const fullIntegrationJs = `
function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function normalizar(valor) {
    return String(valor || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
}

function byId(id) {
    return document.getElementById(id);
}

function isRetorno(os) {
    return os.isRecurrent === true || os.classificacao === 'Garantia Serviço';
}

function causa(os) {
    return os.probableCause || os.causaProvavel || 'infraestrutura_cliente';
}

function ensureMainContent() {
    let content = byId('fsm-tab-content');
    if (content) return content;

    content = byId('analise-tecnica-content')
        || document.querySelector('.analise-container')
        || document.querySelector('#gm-main-table')?.closest('section')
        || document.querySelector('#gm-main-table')?.parentElement;

    if (content) {
        content.id = 'fsm-tab-content';
        return content;
    }

    content = document.createElement('main');
    content.id = 'fsm-tab-content';
    document.body.appendChild(content);
    return content;
}

function ensureMenu() {
    let nav = byId('fsm-tab-nav');
    if (nav) return nav;

    const host = document.querySelector('aside')
        || document.querySelector('nav')
        || document.body;

    nav = document.createElement('div');
    nav.id = 'fsm-tab-nav';
    nav.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; padding:10px;';
    nav.innerHTML = [
        ['painel-do-dia', 'Painel do Dia'],
        ['analise-tecnica', 'Análise Técnica'],
        ['tecnicos', 'Técnicos'],
        ['clientes', 'Clientes'],
        ['laudo-qualidade', 'Laudo & Qualidade']
    ].map(([aba, label]) => '<button class="menu-item" data-aba="' + aba + '" style="padding:7px 10px; border:1px solid #334155; background:#0f172a; color:#e5e7eb; border-radius:4px; cursor:pointer;">' + label + '</button>').join('');

    host.prepend(nav);
    return nav;
}

function processarStatsGlobais(dados) {
    return {
        faturamento: dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0),
        perda: dados.filter(d => d.classificacao === 'Garantia Serviço').length * 281,
        total: dados.length,
        faturaveis: dados.filter(d => d.classificacao === 'Faturável').length,
        fabrica: dados.filter(d => d.classificacao === 'Garantia Fábrica').length,
        servico: dados.filter(d => d.classificacao === 'Garantia Serviço').length,
        criticos: dados.filter(d => d.riskLevel === 'critical').length
    };
}

function atualizarCardsTopo(s) {
    if (byId('gmOsRiscoEstimado')) byId('gmOsRiscoEstimado').innerText = moeda(s.faturamento);
    if (byId('gmOsTotal')) byId('gmOsTotal').innerText = s.total;
    if (byId('gmOsFaturamento')) byId('gmOsFaturamento').innerText = s.faturaveis;
    if (byId('gmOsAlertRecords')) byId('gmOsAlertRecords').innerText = s.servico + s.fabrica;

    const perdaEl = byId('gmOsLossMetric');
    if (perdaEl) perdaEl.innerHTML = '<b style="color:#ef4444">' + moeda(s.perda) + '</b><br><small>Perda por Garantia Serviço</small>';
}

function agrupar(dados, campoFn) {
    return dados.reduce((acc, item) => {
        const key = campoFn(item);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function bar(label, qtd, total, color) {
    const pct = total ? Math.round((qtd / total) * 100) : 0;
    return '<div style="margin:10px 0;"><div style="display:flex; justify-content:space-between; font-size:13px;"><span>' + label + '</span><b>' + qtd + ' OS (' + pct + '%)</b></div><div style="background:#0f172a; height:8px; border-radius:4px; overflow:hidden;"><div style="width:' + pct + '%; height:100%; background:' + color + ';"></div></div></div>';
}

function renderPainelDia(dados, stats) {
    const content = ensureMainContent();
    const causas = agrupar(dados, causa);
    content.innerHTML = '<section style="padding:18px; color:#e5e7eb;">' +
        '<h2>Painel do Dia</h2>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;">' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>Faturamento</small><h3>' + moeda(stats.faturamento) + '</h3></div>' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>Perda Serviço</small><h3 style="color:#ef4444">' + moeda(stats.perda) + '</h3></div>' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>OS Críticas</small><h3>' + stats.criticos + '</h3></div>' +
        '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>Garantia Serviço</small><h3>' + stats.servico + '</h3></div>' +
        '</div>' +
        '<div style="margin-top:16px; background:#1e293b; padding:16px; border-radius:8px;"><h3>Causa Raiz Global</h3>' +
        bar('Hardware', causas.falha_hardware || 0, stats.total, '#e879f9') +
        bar('Comunicação/Rede', causas.falha_comunicacao || 0, stats.total, '#3b82f6') +
        bar('Ajuste/Configuração', causas.ajuste_configuracao || 0, stats.total, '#10b981') +
        bar('Erro Operacional', causas.erro_operacional || 0, stats.total, '#f59e0b') +
        bar('Infraestrutura Cliente', causas.infraestrutura_cliente || 0, stats.total, '#ef4444') +
        '</div></section>';
}

function renderAnaliseTecnica(dados) {
    const content = ensureMainContent();
    const pecas = {};
    dados.forEach(d => (d.pecas || []).forEach(p => { pecas[p] = (pecas[p] || 0) + 1; }));
    const causas = agrupar(dados, causa);

    content.innerHTML = '<section style="padding:18px; color:#e5e7eb;"><h2>Análise Técnica</h2>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px;">' +
        Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([c, qtd]) => '<div style="background:#1e293b; padding:14px; border-radius:8px;"><small>' + c.replace(/_/g, ' ').toUpperCase() + '</small><h3>' + qtd + ' OS</h3></div>').join('') +
        '</div><h3 style="margin-top:18px;">Top Peças por Ativo</h3>' +
        Object.entries(pecas).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, q]) => '<div style="display:flex; justify-content:space-between; background:#1e293b; margin:6px 0; padding:8px; border-radius:4px;"><span>' + p + '</span><b>' + q + ' trocas</b></div>').join('') +
        '</section>';
}

function renderAbaTecnicos(dados) {
    const content = ensureMainContent();
    const techs = {};
    dados.forEach(d => {
        const t = d.tecnico || 'N/A';
        if (!techs[t]) techs[t] = { total: 0, retornos: 0, faturamento: 0 };
        techs[t].total += 1;
        techs[t].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) techs[t].retornos += 1;
    });

    content.innerHTML = '<section style="padding:18px; color:#e5e7eb;"><h2>Técnicos</h2><table style="width:100%; border-collapse:collapse;"><tbody>' +
        Object.entries(techs).sort((a, b) => b[1].faturamento - a[1].faturamento).map(([nome, s]) => {
            const ftf = s.total ? ((s.total - s.retornos) / s.total) * 100 : 100;
            const score = (ftf * 0.7) + (Math.min(s.total, 50) * 0.3);
            return '<tr style="border-bottom:1px solid #334155;"><td style="padding:10px;"><b>' + nome + '</b><br><small>' + s.total + ' OS</small></td><td>' + ftf.toFixed(1) + '% FTF</td><td>Score ' + score.toFixed(0) + '</td><td style="text-align:right;">' + moeda(s.faturamento) + '</td></tr>';
        }).join('') + '</tbody></table></section>';
}

function renderAbaClientes(dados) {
    const content = ensureMainContent();
    const clients = {};
    dados.forEach(d => {
        const c = d.cliente || 'N/A';
        if (!clients[c]) clients[c] = { total: 0, perda: 0, faturamento: 0 };
        clients[c].total += 1;
        clients[c].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) clients[c].perda += 281;
    });

    content.innerHTML = '<section style="padding:18px; color:#e5e7eb;"><h2>Clientes Críticos</h2>' +
        Object.entries(clients).filter(([, s]) => s.perda > 0).sort((a, b) => b[1].perda - a[1].perda).slice(0, 12).map(([nome, s]) => {
            const impacto = s.faturamento ? (s.perda / s.faturamento) * 100 : 0;
            return '<div style="background:#1e293b; padding:12px; border-left:4px solid #ef4444; margin-bottom:8px; border-radius:4px;"><b>' + nome + '</b><br><small>' + s.total + ' OS | impacto ' + impacto.toFixed(1) + '%</small><div style="display:flex; justify-content:space-between;"><span>Faturamento: ' + moeda(s.faturamento) + '</span><b style="color:#ef4444">Perda: ' + moeda(s.perda) + '</b></div></div>';
        }).join('') + '</section>';
}

function renderAbaQualidade(dados) {
    const content = ensureMainContent();
    const fila = dados.filter(d => d.riskLevel === 'critical' || Number(d.confidence || 0) < 85);
    content.innerHTML = '<section style="padding:18px; color:#e5e7eb;"><h2>Laudo & Qualidade</h2><p>' + fila.length + ' OS exigem revisão técnica.</p>' +
        fila.slice(0, 40).map(os => '<div style="background:#1e293b; padding:10px; margin-bottom:6px; border-left:4px solid #ef4444;"><b>' + (os.os_numero || 'S/N') + '</b> - ' + (os.cliente || 'Cliente') + '<br><small>' + (os.recommendation || 'Sem recomendação') + '</small></div>').join('') +
        '</section>';
}

async function renderizarAbas(abaAtiva) {
    try {
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();
        if (!Array.isArray(dados) || !dados.length) return;

        const stats = processarStatsGlobais(dados);
        atualizarCardsTopo(stats);

        document.querySelectorAll('[data-aba]').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-aba') === abaAtiva);
        });

        switch (abaAtiva) {
            case 'analise-tecnica': renderAnaliseTecnica(dados); break;
            case 'tecnicos': renderAbaTecnicos(dados); break;
            case 'clientes': renderAbaClientes(dados); break;
            case 'laudo-qualidade': renderAbaQualidade(dados); break;
            default: renderPainelDia(dados, stats); break;
        }

        console.log('Aba FSM renderizada: ' + abaAtiva);
    } catch (err) {
        console.error('Falha ao renderizar abas FSM:', err);
    }
}

function ativarNavegacaoFSM() {
    ensureMenu();
    document.querySelectorAll('[data-aba], .menu-item').forEach(item => {
        item.addEventListener('click', event => {
            const aba = event.currentTarget.getAttribute('data-aba') || event.target.getAttribute('data-aba');
            if (aba) renderizarAbas(aba);
        });
    });
}

window.onload = function() {
    ativarNavegacaoFSM();
    renderizarAbas('painel-do-dia');
};
`;

atualizarAuditoria();
fs.writeFileSync(appPath, fullIntegrationJs, 'utf8');

const dados = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const resumo = dados.reduce((acc, item) => {
    acc[item.probableCause] = (acc[item.probableCause] || 0) + 1;
    return acc;
}, {});

console.log('Integração Total e Taxonomia Multinível aplicadas.');
console.log(`Resumo de taxonomia: ${JSON.stringify(resumo)}`);
