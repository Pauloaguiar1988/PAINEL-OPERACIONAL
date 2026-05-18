const fs = require('fs');
const path = require('path');

console.log('INICIANDO SANEAMENTO VISUAL PROFUNDO E DIVISAO DE ABAS...');

const appPath = path.join(__dirname, 'app.js');

const cleanVisualAppJs = `
function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function isRecurrent(os) {
    return os.isRecurrent === true || os.classificacao === 'Garantia Serviço';
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function ensureCard(id, title, className) {
    let el = document.getElementById(id);
    if (el) return el;

    const host = document.getElementById('gmPanelAuditWrap')
        || document.getElementById('gmPanelExecutiveWrap')
        || document.body;

    el = document.createElement('div');
    el.id = id;
    el.className = className || 'system-white-card';
    el.innerHTML = '<h3>' + title + '</h3>';
    host.appendChild(el);
    return el;
}

function percent(part, total) {
    return total ? Math.round((part / total) * 100) : 0;
}

function initials(nome) {
    return String(nome || 'NA').substring(0, 2).toUpperCase();
}

function renderCauseDash(causes, dados, perdaTotal) {
    const totalOS = dados.length;
    const redePct = percent(causes.falha_comunicacao || 0, totalOS);
    const hardPct = percent(causes.falha_hardware || 0, totalOS);
    const opPct = percent(causes.erro_operacional || 0, totalOS);
    const criticos = dados.filter(d => d.riskLevel === 'critical').length;

    const card = ensureCard('dash-causa-raiz', 'Causa Raiz', 'system-white-card card-causas');
    card.innerHTML = \`
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; color:#fff; font-family:sans-serif;">
            <div style="background:#1e293b; padding:15px; border-radius:8px;">
                <h4 style="color:#60a5fa; margin:0 0 12px 0; font-size:12px;">RESUMO DE CAUSA RAIZ</h4>
                \${renderCauseBar('Rede/Comunicação', causes.falha_comunicacao || 0, redePct, '#3b82f6')}
                \${renderCauseBar('Hardware', causes.falha_hardware || 0, hardPct, '#e879f9')}
                \${renderCauseBar('Erro Operacional', causes.erro_operacional || 0, opPct, '#f59e0b')}
            </div>
            <div style="background:#1e293b; padding:15px; border-radius:8px;">
                <h4 style="color:#60a5fa; margin:0 0 10px 0; font-size:12px;">CRÍTICOS EM FOCO</h4>
                <div style="font-size:22px;"><b>\${criticos}</b> <span style="font-size:11px; color:#94a3b8;">OS críticas</span></div>
                <div style="margin-top:12px; font-size:18px; color:#ef4444;"><b>\${moeda(perdaTotal)}</b></div>
                <small style="color:#94a3b8;">Perda por retrabalho/retorno</small>
            </div>
        </div>
    \`;

    const loss = document.getElementById('gmOsLossMetric');
    if (loss) {
        loss.innerHTML = '<h3 style="color:#ef4444">' + moeda(perdaTotal) + '</h3><small>Perda por Retrabalho</small>';
    }
}

function renderCauseBar(label, value, pct, color) {
    return \`
        <div style="font-size:13px; display:flex; justify-content:space-between; margin-top:10px;">
            <span>\${label}</span><b>\${value} OS (\${pct}%)</b>
        </div>
        <div style="background:#0f172a; height:8px; border-radius:4px; margin-top:5px; overflow:hidden;">
            <div style="background:\${color}; width:\${pct}%; height:100%;"></div>
        </div>
    \`;
}

function renderOperacao(dados) {
    const gridOp = document.querySelector('#gm-main-table tbody');
    if (!gridOp) return;

    gridOp.innerHTML = dados.slice(-30).reverse().map(os => \`
        <tr style="border-left:4px solid \${os.riskLevel === 'critical' ? '#ef4444' : '#3b82f6'}">
            <td><b>\${os.os_numero || 'S/N'}</b></td>
            <td>\${os.tecnico || 'N/A'}</td>
            <td>\${String(os.cliente || 'Cliente').substring(0, 32)}</td>
            <td><span class="badge">\${os.classificacao || 'N/A'}</span><br><small>\${os.probableCause || 'sem_diagnostico'}</small></td>
            <td>\${moeda(os.valorEstimado)}</td>
        </tr>
    \`).join('');
}

function renderTecnicos(techs) {
    const elTec = document.getElementById('aba-tecnicos-performance') || document.querySelector('#tabela-tecnicos tbody');
    if (!elTec) return;

    const rows = Object.entries(techs)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 10)
        .map(([nome, stat]) => {
            const ftf = stat.total ? ((stat.total - stat.retornos) / stat.total * 100) : 100;
            const cor = ftf >= 80 ? '#10b981' : ftf >= 60 ? '#f59e0b' : '#ef4444';
            return \`
                <tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:10px; display:flex; align-items:center;">
                        <div style="width:32px; height:32px; background:#1e293b; border-radius:50%; margin-right:10px; display:flex; justify-content:center; align-items:center; color:#94a3b8; font-size:10px;">\${initials(nome)}</div>
                        <div><b>\${nome}</b><br><small>\${stat.total} OS | \${stat.retornos} retornos</small></div>
                    </td>
                    <td style="text-align:right; color:\${cor};"><b>\${ftf.toFixed(1)}% FTF</b></td>
                    <td style="text-align:right;">Score \${stat.score.toFixed(0)}</td>
                    <td style="text-align:right;">\${moeda(stat.faturamento)}</td>
                </tr>
            \`;
        }).join('');

    elTec.innerHTML = rows;
}

function renderClientes(clients) {
    const elCli = document.getElementById('aba-clientes-risco') || document.querySelector('#tabela-clientes tbody');
    if (!elCli) return;

    const rows = Object.entries(clients)
        .filter(([, s]) => s.perda > 0)
        .sort((a, b) => b[1].perda - a[1].perda)
        .slice(0, 5)
        .map(([nome, stat]) => {
            const impacto = stat.faturamento ? (stat.perda / stat.faturamento) * 100 : 0;
            return \`
                <tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:10px; color:#ef4444;"><b>\${String(nome).substring(0, 36)}</b><br><small>\${stat.total} OS | impacto \${impacto.toFixed(1)}%</small></td>
                    <td style="text-align:right;">\${moeda(stat.faturamento)}</td>
                    <td style="text-align:right; font-weight:bold; color:#ef4444;">- \${moeda(stat.perda)}</td>
                </tr>
            \`;
        }).join('');

    elCli.innerHTML = rows || '<tr><td colspan="3">Sem clientes com dreno acima do limite.</td></tr>';
}

function renderPecas(parts) {
    const elPart = document.getElementById('aba-pecas-trocadas') || document.querySelector('.card-pecas') || ensureCard('aba-pecas-trocadas', 'Top Peças Trocadas', 'system-white-card card-pecas');
    const topParts = Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    elPart.innerHTML = '<h3 style="color:#94a3b8; font-size:12px;">TOP 10 PEÇAS MAIS TROCADAS</h3>' +
        (topParts.map(([part, qtd]) => \`
            <div style="background:#1e293b; padding:8px; border-radius:4px; margin-bottom:5px; font-size:11px; color:#fff; display:flex; justify-content:space-between;">
                <span>\${part}</span><b>\${qtd} un</b>
            </div>
        \`).join('') || '<small>Sem peças trocadas na base.</small>');
}

async function renderIntegratedFSM() {
    try {
        console.log('Sincronizando e limpando painel Integrated FSM...');
        const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
        const dados = await res.json();
        if (!Array.isArray(dados) || dados.length === 0) return;

        const techs = {};
        const clients = {};
        const parts = {};
        const causes = { falha_comunicacao: 0, falha_hardware: 0, erro_operacional: 0 };
        let perdaTotal = 0;
        let faturamento = 0;

        dados.forEach(d => {
            const tecnico = d.tecnico || 'N/A';
            const cliente = d.cliente || 'N/A';
            const recorrente = isRecurrent(d);
            const valor = Number(d.valorEstimado || 0);

            if (!techs[tecnico]) techs[tecnico] = { faturamento: 0, total: 0, retornos: 0, score: 0 };
            techs[tecnico].faturamento += valor;
            techs[tecnico].total += 1;
            if (recorrente) techs[tecnico].retornos += 1;

            if (!clients[cliente]) clients[cliente] = { total: 0, perda: 0, faturamento: 0 };
            clients[cliente].total += 1;
            clients[cliente].faturamento += valor;

            if (recorrente) {
                clients[cliente].perda += 281;
                perdaTotal += 281;
            }

            (d.pecas || []).forEach(p => { parts[p] = (parts[p] || 0) + 1; });

            const causa = d.probableCause || 'sem_diagnostico';
            causes[causa] = (causes[causa] || 0) + 1;
            faturamento += valor;
        });

        Object.values(techs).forEach(stat => {
            const ftf = stat.total ? ((stat.total - stat.retornos) / stat.total * 100) : 100;
            stat.score = (ftf * 0.7) + (Math.min(stat.total, 50) * 0.3);
        });

        setText('gmOsTotal', dados.length);
        setText('gmOsRiscoEstimado', moeda(faturamento));
        setText('gmOsFaturamento', dados.filter(d => d.classificacao === 'Faturável').length);
        setText('gmOsAlertRecords', dados.filter(d => d.classificacao !== 'Faturável').length);

        renderCauseDash(causes, dados, perdaTotal);
        renderOperacao(dados);
        renderTecnicos(techs);
        renderClientes(clients);
        renderPecas(parts);

        console.log('Visual Clean e Saneado aplicado.');
    } catch (err) {
        console.error('Falha no visual clean:', err);
    }
}

window.onload = function() {
    renderIntegratedFSM();
    setInterval(renderIntegratedFSM, 30000);
};
`;

fs.writeFileSync(appPath, cleanVisualAppJs, 'utf8');
console.log('app.js reescrito com visual clean e divisao de abas respectiva.');
