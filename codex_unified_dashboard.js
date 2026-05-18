const fs = require('fs');
const path = require('path');

console.log('UNIFICANDO INTERFACE E SINCRONIZANDO INDICES EM TEMPO REAL...');

const appPath = path.join(__dirname, 'app.js');

function writeUnifiedApp() {
    const unifiedAppJs = `
function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function normalizar(valor) {
    return String(valor || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function ensurePanel(id, title, className) {
    let panel = document.getElementById(id);
    if (panel) return panel;

    const host = document.getElementById('gmPanelAuditWrap')
        || document.getElementById('gmPanelExecutiveWrap')
        || document.body;

    panel = document.createElement('div');
    panel.id = id;
    panel.className = className || 'system-white-card';
    panel.innerHTML = '<h3>' + title + '</h3><div class="system-list"></div>';
    host.appendChild(panel);
    return panel;
}

function riskColor(risk) {
    if (risk === 'critical') return '#ef4444';
    if (risk === 'high') return '#f59e0b';
    if (risk === 'medium') return '#eab308';
    return '#10b981';
}

function isGarantia(os) {
    return normalizar(os.classificacao).includes('garantia');
}

function isRecurrent(os) {
    return os.isRecurrent === true || Number(os.recurrenceCount || 0) > 1;
}

function precisaRevisao(os) {
    const reviewed = os.governance && os.governance.status === 'reviewed';
    return !reviewed && (os.riskLevel === 'critical' || Number(os.confidence || 0) < 85);
}

function calcularStats(dados) {
    return {
        faturamento: dados.reduce((acc, os) => acc + Number(os.valorEstimado || 0), 0),
        perda: dados.filter(isRecurrent).length * 281,
        garantias: dados.filter(isGarantia).length,
        faturaveis: dados.filter(os => !isGarantia(os)).length,
        criticos: dados.filter(os => os.riskLevel === 'critical').length,
        revisao: dados.filter(precisaRevisao).length,
        pecas: dados.reduce((acc, os) => acc + (Array.isArray(os.pecas) ? os.pecas.length : 0), 0)
    };
}

function renderCards(dados, stats) {
    setText('gmOsRiscoEstimado', moeda(stats.faturamento));
    setText('gmOsTotal', dados.length);
    setText('gmOsFaturamento', stats.faturaveis);
    setText('gmOsAlertRecords', stats.garantias);
    setText('gmTickets', stats.revisao || stats.criticos);

    const elLoss = document.getElementById('gmOsLossMetric') || ensurePanel('gmOsLossMetric', 'Perda por Reincidencia', 'system-white-card card-perda');
    elLoss.innerHTML = '<h3 style="color:#ef4444; font-size:11px;">PERDA POR REINCIDENCIA</h3><b style="color:#ef4444">' + moeda(stats.perda) + '</b><br><small>' + dados.filter(isRecurrent).length + ' visitas extras</small>';
}

function renderOperacao(dados) {
    const gridOp = document.querySelector('#gm-main-table tbody') || document.querySelector('.os-grid tbody');
    if (!gridOp) return;

    gridOp.innerHTML = dados.slice(-50).reverse().map(os => {
        const risk = os.riskLevel || 'low';
        const auditButton = precisaRevisao(os)
            ? '<br><button onclick="auditarOS(\\'' + (os.os_numero || '') + '\\')" style="margin-top:4px; background:#2563eb; color:#fff; border:none; padding:3px 7px; border-radius:3px; cursor:pointer;">Auditar OS</button>'
            : '';

        return '<tr style="border-left:4px solid ' + riskColor(risk) + '">' +
            '<td><b>' + (os.os_numero || 'S/N') + '</b></td>' +
            '<td>' + (os.tecnico || 'N/A') + '</td>' +
            '<td>' + String(os.cliente || 'Cliente').substring(0, 32) + '<br><small>' + (os.modelo || 'Equip.') + ' | SN: ' + (os.serial || 'S/N') + '</small></td>' +
            '<td><span class="badge">' + (os.classificacao || 'N/A') + '</span><br><small>' + (os.probableCause || os.causaProvavel || 'sem_diagnostico') + '</small></td>' +
            '<td><b style="color:' + riskColor(risk) + '">' + String(risk).toUpperCase() + '</b>' + auditButton + '</td>' +
            '<td>' + moeda(os.valorEstimado) + '</td>' +
        '</tr>';
    }).join('');
}

function renderTecnicos(dados) {
    const gridTec = document.querySelector('#tabela-tecnicos tbody');
    if (!gridTec) return;

    const techs = {};
    dados.forEach(os => {
        const tecnico = os.tecnico || 'N/A';
        if (!techs[tecnico]) techs[tecnico] = { faturamento: 0, total: 0, retornos: 0, perda: 0 };
        techs[tecnico].faturamento += Number(os.valorEstimado || 0);
        techs[tecnico].total += 1;
        if (isRecurrent(os)) {
            techs[tecnico].retornos += 1;
            techs[tecnico].perda += 281;
        }
    });

    gridTec.innerHTML = Object.entries(techs)
        .sort((a, b) => b[1].faturamento - a[1].faturamento)
        .map(([nome, s]) => {
            const ftf = s.total ? ((s.total - s.retornos) / s.total * 100) : 100;
            const badge = ftf >= 95 ? 'ELITE FTF' : ftf < 60 ? 'RECICLAGEM' : 'OPERACIONAL';
            return '<tr><td><b>' + nome + '</b><br><small>' + badge + '</small></td><td>' + ftf.toFixed(1) + '% FTF<br><small>' + s.retornos + ' retornos</small></td><td>' + moeda(s.faturamento) + '<br><small style="color:#ef4444">Perda: ' + moeda(s.perda) + '</small></td></tr>';
        }).join('');
}

function renderClientes(dados) {
    const gridCli = document.querySelector('#tabela-clientes tbody');
    if (!gridCli) return;

    const clients = {};
    dados.forEach(os => {
        const cliente = os.cliente || 'N/A';
        if (!clients[cliente]) clients[cliente] = { total: 0, retornos: 0, faturamento: 0, ativos: new Set() };
        clients[cliente].total += 1;
        clients[cliente].faturamento += Number(os.valorEstimado || 0);
        if (isRecurrent(os)) clients[cliente].retornos += 1;
        if (os.serial && os.serial !== 'S/N') clients[cliente].ativos.add((os.modelo || 'Equip.') + ' (' + os.serial + ')');
    });

    gridCli.innerHTML = Object.entries(clients)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 30)
        .map(([nome, s]) => {
            const ftf = s.total ? ((s.total - s.retornos) / s.total * 100) : 100;
            return '<tr><td>' + nome + '</td><td style="font-size:10px;">' + (Array.from(s.ativos).slice(0, 2).join(', ') || 'Equipamento') + '</td><td>' + s.total + ' OS<br><small>FTF ' + ftf.toFixed(1) + '%</small></td><td>' + moeda(s.faturamento) + '</td></tr>';
        }).join('');
}

function renderReviewQueue(dados) {
    const fila = dados.filter(precisaRevisao);
    const panel = ensurePanel('gmReviewQueue', 'Fila de Revisao IA', 'system-white-card card-review');
    const list = panel.querySelector('.system-list') || panel;

    list.innerHTML = '<div class="system-line"><strong>' + fila.length + ' atendimentos</strong><span>aguardam validacao tecnica</span></div>' +
        '<div style="max-height:220px; overflow-y:auto; margin-top:10px;">' +
        fila.slice(0, 38).map(os =>
            '<div style="background:#1e293b; color:#e5e7eb; padding:8px; margin-bottom:6px; border-radius:4px; font-size:11px;">' +
            '<strong>' + (os.os_numero || 'S/N') + '</strong> - ' + (os.tecnico || 'N/A') +
            '<button onclick="auditarOS(\\'' + (os.os_numero || '') + '\\')" style="float:right; background:#2563eb; border:none; color:white; padding:3px 7px; cursor:pointer; border-radius:3px;">Auditar OS</button>' +
            '<br><span>' + (os.cliente || 'Cliente') + ' | ' + String(os.riskLevel || 'low').toUpperCase() + ' | ' + (os.confidence || 0) + '% conf.</span></div>'
        ).join('') + '</div>';
}

function renderPecas(dados) {
    const pecas = {};
    dados.forEach(os => (os.pecas || []).forEach(p => { pecas[p] = (pecas[p] || 0) + 1; }));
    const totalPecas = Object.values(pecas).reduce((a, b) => a + b, 0);

    const panel = ensurePanel('gmPecasChart', 'Estoque Critico', 'system-white-card card-pecas');
    const list = panel.querySelector('.system-list') || panel;
    list.innerHTML = Object.entries(pecas).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, qtd]) =>
        '<div class="system-line"><strong>' + p + '</strong><span>' + qtd + ' un</span></div>'
    ).join('') || '<div class="system-line"><span>Sem peca recorrente.</span></div>';

    const inv = ensurePanel('gmInventoryValue', 'Provisionamento de Pecas', 'system-white-card card-estoque-valor');
    inv.innerHTML = '<h3>Provisionamento de Pecas</h3><b>' + moeda(totalPecas * 150) + '</b><br><small>Base: ' + totalPecas + ' componentes mapeados</small>';
}

function renderCausaRaiz(dados) {
    const causas = {};
    dados.forEach(os => {
        const c = os.probableCause || os.causaProvavel || 'sem_diagnostico';
        causas[c] = (causas[c] || 0) + 1;
    });

    const panel = ensurePanel('gmRootCauseChart', 'Causa Raiz', 'system-white-card card-causas');
    panel.innerHTML = '<h3 style="color:#94a3b8; font-size:12px;">INCIDENCIA POR CAUSA RAIZ</h3><div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
        Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([causa, qtd]) =>
            '<div style="background:#1e293b; padding:10px; border-radius:6px; border-top:2px solid #3b82f6;"><small style="color:#60a5fa; display:block;">' + causa.replace(/_/g, ' ').toUpperCase() + '</small><b style="font-size:18px;">' + qtd + ' <span style="font-size:10px; color:#94a3b8;">OS</span></b></div>'
        ).join('') + '</div>';
}

function renderContractRisk(dados) {
    const clients = {};
    dados.forEach(os => {
        const cliente = os.cliente || 'N/A';
        if (!clients[cliente]) clients[cliente] = { total: 0, retornos: 0, faturamento: 0 };
        clients[cliente].total += 1;
        clients[cliente].faturamento += Number(os.valorEstimado || 0);
        if (isRecurrent(os)) clients[cliente].retornos += 1;
    });

    const risco = Object.entries(clients).map(([name, s]) => {
        const perda = s.retornos * 281;
        const impacto = s.faturamento ? (perda / s.faturamento) * 100 : 0;
        const ftf = s.total ? ((s.total - s.retornos) / s.total * 100) : 100;
        return { name, perda, impacto, ftf, total: s.total };
    }).filter(r => r.impacto > 30).sort((a, b) => b.perda - a.perda);

    const panel = ensurePanel('gmContractRisk', 'Risco Contratual', 'system-white-card card-risco-contratual');
    panel.innerHTML = '<h3 style="color:#f87171; font-size:12px;">RISCO CONTRATUAL DETECTADO</h3>' +
        risco.slice(0, 10).map(r => '<div style="background:#450a0a; padding:8px; border-radius:4px; margin-bottom:5px; border-left:4px solid #ef4444;"><b style="font-size:11px; color:#fca5a5;">' + r.name + '</b><br><small>Impacto: ' + r.impacto.toFixed(1) + '% | FTF: ' + r.ftf.toFixed(1) + '%</small><br><small style="color:#f87171;">Perda: ' + moeda(r.perda) + '</small></div>').join('');
}

function renderDreno(dados) {
    const serials = {};
    dados.forEach(os => {
        if (!os.serial || os.serial === 'S/N') return;
        if (!serials[os.serial]) serials[os.serial] = { count: 0, cliente: os.cliente || 'N/A', perda: 0 };
        serials[os.serial].count += 1;
        if (isRecurrent(os)) serials[os.serial].perda += 281;
    });

    const criticos = Object.entries(serials).filter(([, s]) => s.count >= 3).sort((a, b) => b[1].count - a[1].count);
    const panel = ensurePanel('gmDrainAlert', 'Dreno de Margem', 'system-white-card card-alerta-critico');
    panel.innerHTML = '<h3 style="color:#fca5a5; font-size:12px;">DRENO DE MARGEM</h3><p>' + criticos.length + ' seriais com 3+ visitas.</p>' +
        criticos.slice(0, 8).map(([sn, s]) => '<div style="padding:6px 0; border-top:1px solid #7f1d1d;"><b>' + sn + '</b><br><small>' + s.cliente + ' | ' + s.count + ' visitas | ' + moeda(s.perda) + '</small></div>').join('');
}

function renderCopilot(dados) {
    const rede = dados.filter(os => (os.probableCause || os.causaProvavel) === 'falha_comunicacao' && (os.riskLevel === 'high' || os.riskLevel === 'critical'));
    const panel = ensurePanel('gmCopilotAdvice', 'Copiloto Preditivo', 'system-white-card card-copiloto');
    panel.innerHTML = '<div style="background:#172554; border:1px solid #3b82f6; padding:12px; border-radius:8px;"><h3 style="color:#60a5fa; font-size:12px;">COPILOTO ESTRATEGICO IA</h3><p>Detectados <b>' + rede.length + '</b> chamados de comunicacao/rede com risco alto ou critico.</p><small>NAO ENVIAR TECNICO antes de validar reboot de rede, IP, gateway, DNS, VPN/firewall e comunicacao externa com o TI do cliente.</small></div>';
}

async function refreshFSMDashboard() {
    try {
        console.log('Sincronizando dados com a base FSM...');
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();
        if (!Array.isArray(dados) || dados.length === 0) return;

        const stats = calcularStats(dados);
        renderCards(dados, stats);
        renderOperacao(dados);
        renderTecnicos(dados);
        renderClientes(dados);
        renderReviewQueue(dados);
        renderPecas(dados);
        renderCausaRaiz(dados);
        renderContractRisk(dados);
        renderDreno(dados);
        renderCopilot(dados);

        console.log('Dashboard sincronizado: ' + dados.length + ' registros.');
    } catch (err) {
        console.error('Falha na sincronizacao FSM:', err);
    }
}

window.auditarOS = async function auditarOS(osNumero) {
    const justificativa = prompt('Justificativa tecnica para aprovacao/ajuste da OS ' + osNumero + ':');
    if (!justificativa) return;

    try {
        const res = await fetch('/api/governance/audit-os', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                os_numero: osNumero,
                decision: 'aprovado',
                justification: justificativa,
                reviewer: 'Paulo Aguiar'
            })
        });
        const payload = await res.json();
        if (!res.ok || !payload.ok) throw new Error(payload.error || 'Falha ao registrar auditoria.');
        alert('Governanca tecnica registrada com sucesso.');
        refreshFSMDashboard();
    } catch (err) {
        alert('Falha ao registrar auditoria: ' + err.message);
    }
};

window.onload = function() {
    refreshFSMDashboard();
    setInterval(refreshFSMDashboard, 30000);
};
`;

    fs.writeFileSync(appPath, unifiedAppJs, 'utf8');
}

writeUnifiedApp();
console.log('app.js reestruturado para alimentacao de campos respectiva.');
