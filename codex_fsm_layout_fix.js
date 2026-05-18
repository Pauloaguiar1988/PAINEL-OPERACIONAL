const fs = require('fs');
const path = require('path');

console.log('RECONSTRUINDO ESTRUTURA VISUAL (LIMPEZA TOTAL)...');

const appPath = path.join(__dirname, 'app.js');

const layoutFixJs = `
function injectFSMLayoutStyle() {
    if (document.getElementById('fsm-layout-style')) return;

    const style = document.createElement('style');
    style.id = 'fsm-layout-style';
    style.innerHTML = \`
        body { overflow-x: hidden; }
        .sidebar { position: fixed; left: 0; top: 0; height: 100vh; width: 260px; z-index: 100; background: #0f172a; overflow-y: auto; }
        .main-content, #fsm-layout-root { margin-left: 260px; padding: 20px; width: calc(100% - 260px); min-height: 100vh; position: relative; z-index: 1; box-sizing: border-box; }
        #fsm-layout-root { background: #020617; color: #e5e7eb; }
        #fsm-view-host { width: 100%; max-width: 1440px; margin: 0 auto; }
        .fsm-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .fsm-tab-button { border: 1px solid #334155; background: #0f172a; color: #e5e7eb; border-radius: 4px; padding: 8px 11px; cursor: pointer; }
        .fsm-tab-button.active, .menu-item.active { background: #2563eb !important; color: #fff !important; }
        .fsm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
        .card-fsm { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 14px; border: 1px solid #334155; box-sizing: border-box; }
        .card-fsm h3, .card-fsm h4 { margin: 0 0 8px 0; }
        .fsm-table { width: 100%; border-collapse: collapse; background: #0f172a; border: 1px solid #334155; }
        .fsm-table td, .fsm-table th { padding: 10px; border-bottom: 1px solid #1e293b; text-align: left; vertical-align: top; }
        .fsm-muted { color: #94a3b8; font-size: 12px; }
        .fsm-danger { color: #ef4444; }
        .fsm-ok { color: #10b981; }
        .fsm-bar { height: 8px; background: #0f172a; border-radius: 5px; overflow: hidden; margin-top: 5px; }
        .fsm-bar > div { height: 100%; }
        @media (max-width: 900px) {
            .sidebar { position: relative; width: 100%; height: auto; }
            .main-content, #fsm-layout-root { margin-left: 0; width: 100%; padding: 12px; }
        }
    \`;
    document.head.appendChild(style);
}

function moeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function byId(id) {
    return document.getElementById(id);
}

function slug(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function isRetorno(os) {
    return os.isRecurrent === true || os.classificacao === 'Garantia Serviço';
}

function ensureLayoutRoot() {
    injectFSMLayoutStyle();

    let root = byId('fsm-layout-root');
    if (!root) {
        const existingMain = document.querySelector('.main-content');
        root = existingMain || document.createElement('main');
        root.id = 'fsm-layout-root';
        root.classList.add('main-content');

        if (!existingMain) document.body.appendChild(root);
    }

    root.innerHTML = \`
        <div id="fsm-view-host">
            <div class="fsm-tabs">
                <button class="fsm-tab-button" data-aba="painel-do-dia">Painel do Dia</button>
                <button class="fsm-tab-button" data-aba="operacao">Operação</button>
                <button class="fsm-tab-button" data-aba="analise-tecnica">Análise Técnica</button>
                <button class="fsm-tab-button" data-aba="tecnicos">Técnicos</button>
                <button class="fsm-tab-button" data-aba="clientes">Clientes</button>
                <button class="fsm-tab-button" data-aba="governanca">Governança</button>
            </div>
            <div id="fsm-view-content"></div>
        </div>
    \`;

    return root;
}

async function fetchFSM() {
    const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
    const dados = await res.json();
    return Array.isArray(dados) ? dados : [];
}

function statsGlobais(dados) {
    return {
        total: dados.length,
        faturamento: dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0),
        perda: dados.filter(d => d.classificacao === 'Garantia Serviço').length * 281,
        faturaveis: dados.filter(d => d.classificacao === 'Faturável').length,
        garantiasFabrica: dados.filter(d => d.classificacao === 'Garantia Fábrica').length,
        garantiasServico: dados.filter(d => d.classificacao === 'Garantia Serviço').length,
        criticos: dados.filter(d => d.riskLevel === 'critical').length
    };
}

function atualizarWidgetsLaterais(dados) {
    const s = statsGlobais(dados);
    const map = {
        gmOsRiscoEstimado: moeda(s.faturamento),
        gmOsTotal: s.total,
        gmOsFaturamento: s.faturaveis,
        gmOsAlertRecords: s.garantiasFabrica + s.garantiasServico
    };

    Object.entries(map).forEach(([id, valor]) => {
        const el = byId(id);
        if (el) el.innerText = valor;
    });

    document.querySelectorAll('.valor-faturamento').forEach(el => { el.innerText = moeda(s.faturamento); });
    document.querySelectorAll('.valor-perda').forEach(el => { el.innerText = moeda(s.perda); });
}

function groupCount(dados, fn) {
    return dados.reduce((acc, item) => {
        const key = fn(item);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function bar(label, qtd, total, color) {
    const pct = total ? Math.round((qtd / total) * 100) : 0;
    return \`
        <div style="margin:10px 0;">
            <div style="display:flex; justify-content:space-between;"><span>\${label}</span><b>\${qtd} OS (\${pct}%)</b></div>
            <div class="fsm-bar"><div style="width:\${pct}%; background:\${color};"></div></div>
        </div>
    \`;
}

function renderPainelDia(host, dados) {
    const s = statsGlobais(dados);
    const causas = groupCount(dados, d => d.probableCause || 'sem_diagnostico');

    host.innerHTML = \`
        <section>
            <h2>Painel do Dia</h2>
            <div class="fsm-grid">
                <div class="card-fsm"><span class="fsm-muted">Faturamento</span><h3>\${moeda(s.faturamento)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Perda Serviço</span><h3 class="fsm-danger">\${moeda(s.perda)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">OS Críticas</span><h3>\${s.criticos}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Total OS</span><h3>\${s.total}</h3></div>
            </div>
            <div class="card-fsm">
                <h3>Causa Raiz</h3>
                \${bar('Comunicação/Rede', causas.falha_comunicacao || 0, s.total, '#3b82f6')}
                \${bar('Hardware', causas.falha_hardware || 0, s.total, '#e879f9')}
                \${bar('Infraestrutura Cliente', causas.infraestrutura_cliente || 0, s.total, '#ef4444')}
                \${bar('Ajuste/Configuração', causas.ajuste_configuracao || 0, s.total, '#10b981')}
            </div>
        </section>
    \`;
}

function renderOperacao(host, dados) {
    host.innerHTML = \`
        <section>
            <h2>Operação</h2>
            <table class="fsm-table">
                <tbody>
                    \${dados.slice(-70).reverse().map(os => \`
                        <tr>
                            <td><b>\${os.os_numero || 'S/N'}</b></td>
                            <td>\${os.tecnico || 'N/A'}</td>
                            <td>\${os.cliente || 'Cliente'}</td>
                            <td>\${os.classificacao || 'N/A'}<br><span class="fsm-muted">\${os.probableCause || 'sem_diagnostico'}</span></td>
                            <td style="text-align:right;">\${moeda(os.valorEstimado)}</td>
                        </tr>
                    \`).join('')}
                </tbody>
            </table>
        </section>
    \`;
}

function renderAnaliseTecnica(host, dados) {
    const causas = groupCount(dados, d => d.probableCause || 'sem_diagnostico');
    const pecas = {};
    dados.forEach(d => (d.pecas || []).forEach(p => { pecas[p] = (pecas[p] || 0) + 1; }));

    host.innerHTML = \`
        <section>
            <h2>Análise Técnica</h2>
            <div id="inteligencia-equipamento" class="fsm-grid">
                \${Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([causa, qtd]) => \`
                    <div class="card-fsm">
                        <span class="fsm-muted">\${causa.replace(/_/g, ' ').toUpperCase()}</span>
                        <h3>\${qtd} OS</h3>
                    </div>
                \`).join('')}
            </div>
            <div class="card-fsm">
                <h3>Top Peças Mais Trocadas</h3>
                \${Object.entries(pecas).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([peca, qtd]) => \`
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:7px 0;">
                        <span>\${peca}</span><b>\${qtd} un</b>
                    </div>
                \`).join('') || '<span class="fsm-muted">Sem peças mapeadas.</span>'}
            </div>
        </section>
    \`;
}

function renderTecnicos(host, dados) {
    const techs = {};
    dados.forEach(d => {
        const t = d.tecnico || 'N/A';
        if (!techs[t]) techs[t] = { total: 0, retornos: 0, faturamento: 0 };
        techs[t].total += 1;
        techs[t].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) techs[t].retornos += 1;
    });

    host.innerHTML = \`
        <section>
            <h2>Técnicos</h2>
            <table class="fsm-table">
                <tbody>
                    \${Object.entries(techs).sort((a, b) => b[1].faturamento - a[1].faturamento).map(([nome, s]) => {
                        const ftf = s.total ? ((s.total - s.retornos) / s.total) * 100 : 100;
                        return \`
                            <tr>
                                <td><b>\${nome}</b><br><span class="fsm-muted">\${s.total} OS</span></td>
                                <td>\${ftf.toFixed(1)}% FTF</td>
                                <td>\${s.retornos} retornos</td>
                                <td style="text-align:right;">\${moeda(s.faturamento)}</td>
                            </tr>
                        \`;
                    }).join('')}
                </tbody>
            </table>
        </section>
    \`;
}

function renderClientes(host, dados) {
    const clients = {};
    dados.forEach(d => {
        const c = d.cliente || 'N/A';
        if (!clients[c]) clients[c] = { total: 0, perda: 0, faturamento: 0 };
        clients[c].total += 1;
        clients[c].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) clients[c].perda += 281;
    });

    host.innerHTML = \`
        <section>
            <h2>Clientes</h2>
            \${Object.entries(clients).filter(([, s]) => s.perda > 0).sort((a, b) => b[1].perda - a[1].perda).slice(0, 15).map(([nome, s]) => {
                const impacto = s.faturamento ? (s.perda / s.faturamento) * 100 : 0;
                return \`
                    <div class="card-fsm" style="border-left:4px solid #ef4444;">
                        <b>\${nome}</b><br>
                        <span class="fsm-muted">\${s.total} OS | Impacto \${impacto.toFixed(1)}%</span>
                        <div style="display:flex; justify-content:space-between; margin-top:8px;">
                            <span>\${moeda(s.faturamento)}</span>
                            <b class="fsm-danger">-\${moeda(s.perda)}</b>
                        </div>
                    </div>
                \`;
            }).join('')}
        </section>
    \`;
}

function renderGovernanca(host, dados) {
    const fila = dados.filter(d => d.riskLevel === 'critical' || Number(d.confidence || 0) < 85);
    const criticos = dados.filter(d => d.riskLevel === 'critical').length;
    const auditados = dados.filter(d => d.auditStatus === 'reviewed' || (d.governance && d.governance.status === 'reviewed')).length;
    const saude = criticos ? Math.round((Math.min(auditados, criticos) / criticos) * 100) : 100;

    host.innerHTML = \`
        <section>
            <h2>Governança</h2>
            <div class="card-fsm">
                <span class="fsm-muted">Saúde da Governança</span>
                <h3>\${saude}%</h3>
            </div>
            \${fila.slice(0, 50).map(os => \`
                <div class="card-fsm" style="border-left:4px solid #ef4444;">
                    <b>\${os.os_numero || 'S/N'}</b> - \${os.cliente || 'Cliente'}<br>
                    <span class="fsm-muted">\${os.recommendation || 'Sem recomendação'}</span>
                </div>
            \`).join('')}
        </section>
    \`;
}

async function switchTab(abaId) {
    const aba = slug(abaId || 'painel-do-dia');
    const host = byId('fsm-view-content');
    if (!host) return;

    console.log('Ativando Aba:', aba);
    document.querySelectorAll('[data-aba], .fsm-tab-button, .menu-item').forEach(btn => {
        const btnAba = btn.getAttribute('data-aba') || slug(btn.innerText);
        btn.classList.toggle('active', btnAba === aba);
    });

    const dados = await fetchFSM();
    atualizarWidgetsLaterais(dados);

    if (aba === 'operacao') return renderOperacao(host, dados);
    if (aba === 'analise-tecnica') return renderAnaliseTecnica(host, dados);
    if (aba === 'tecnicos') return renderTecnicos(host, dados);
    if (aba === 'clientes') return renderClientes(host, dados);
    if (aba === 'governanca' || aba === 'laudo-qualidade') return renderGovernanca(host, dados);
    return renderPainelDia(host, dados);
}

document.addEventListener('click', event => {
    const item = event.target.closest('[data-aba]') || event.target.closest('.menu-item');
    if (!item) return;

    const aba = item.getAttribute('data-aba') || slug(item.innerText);
    event.preventDefault();
    switchTab(aba);
});

window.onload = function() {
    ensureLayoutRoot();
    switchTab('painel-do-dia');
};
`;

fs.writeFileSync(appPath, layoutFixJs, 'utf8');
console.log('Layout reestruturado. O conteudo agora respeita o menu lateral.');
