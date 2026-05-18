const fs = require('fs');
const path = require('path');

console.log('RECONSTRUINDO O SISTEMA COM BASE NA MEMORIA INTEGRAL DO PROJETO...');

const appPath = path.join(__dirname, 'app.js');

const masterAppJs = `
function injectAbsoluteStyle() {
    if (document.getElementById('fsm-absolute-style')) return;
    const style = document.createElement('style');
    style.id = 'fsm-absolute-style';
    style.innerHTML = \`
        body { overflow-x:hidden; background:#020617; }
        .sidebar { position:fixed; left:0; top:0; width:260px; height:100vh; z-index:100; background:#0f172a; overflow-y:auto; }
        .main-content, #fsm-layout-root { margin-left:260px; width:calc(100% - 260px); min-height:100vh; padding:20px; box-sizing:border-box; color:#e5e7eb; }
        #fsm-view-host { max-width:1440px; margin:0 auto; }
        .card-fsm, .card-tecnico, .card-peca { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:16px; margin-bottom:12px; }
        .fsm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
        .fsm-table { width:100%; border-collapse:collapse; background:#1e293b; border-radius:8px; overflow:hidden; }
        .fsm-table th, .fsm-table td { padding:10px; border-bottom:1px solid #334155; text-align:left; vertical-align:top; }
        .fsm-muted { color:#94a3b8; font-size:12px; }
        .tag { display:inline-block; border:1px solid #334155; background:#0f172a; border-radius:999px; padding:3px 8px; font-size:12px; }
        .tag.primary { border-color:#10b981; color:#bbf7d0; }
        .tag.error { border-color:#ef4444; color:#fca5a5; }
        .tag.info { border-color:#60a5fa; color:#bfdbfe; }
        .tag.success { border-color:#10b981; color:#86efac; }
        .tag.warning { border-color:#f59e0b; color:#fde68a; }
        .btn-fsm { border:1px solid #334155; background:#0f172a; color:#e5e7eb; border-radius:999px; padding:8px 12px; cursor:pointer; }
        .menu-item.active, [data-aba].active { background:#2563eb !important; color:#fff !important; }
        @media (max-width:900px) {
            .sidebar { position:relative; width:100%; height:auto; }
            .main-content, #fsm-layout-root { margin-left:0; width:100%; padding:12px; }
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

function slug(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLowerCase()
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function ensureRoot() {
    injectAbsoluteStyle();
    let root = document.getElementById('fsm-layout-root') || document.querySelector('.main-content');
    if (!root) {
        root = document.createElement('main');
        document.body.appendChild(root);
    }
    root.id = 'fsm-layout-root';
    root.classList.add('main-content');
    if (!document.getElementById('fsm-view-content')) {
        root.innerHTML = '<div id="fsm-view-host"><div id="fsm-view-content"></div></div>';
    }
    return document.getElementById('fsm-view-content');
}

async function getDados() {
    const res = await fetch('/api/dashboard/tabela', { cache:'no-store' });
    const dados = await res.json();
    return Array.isArray(dados) ? dados : [];
}

function processarRelatorioTagus(d) {
    return {
        id: d.os_numero || 'S/N',
        cliente: d.cliente || 'CLIENTE NAO IDENTIFICADO',
        tecnico: d.tecnico || 'TECNICO NAO IDENTIFICADO',
        serial: d.serial || 'S/N',
        status: d.truthLabel || d.classificacao || 'Sem regra',
        statusUi: d.truthStatus || 'primary',
        faturamento: Number(d.truthValue ?? d.valorEstimado ?? 0),
        perda: Number(d.truthLoss ?? d.perdaEstimativa ?? 0),
        causa: d.causaRaizForense || d.probableCause || 'Sem diagnostico',
        pecas: Array.isArray(d.pecas) ? d.pecas : [],
        risk: d.riskLevel || 'low',
        regra: d.truthReason || d.businessRule || d.recommendation || '-',
        linkedBillingOS: d.linkedBillingOS,
        linkedSourceOS: d.linkedSourceOS
    };
}

function atualizarIndicadores(base) {
    const fatTotal = base.reduce((a, b) => a + b.faturamento, 0);
    const perdaTotal = base.reduce((a, b) => a + b.perda, 0);
    const faturaveis = base.filter(b => b.status === 'FATURÁVEL AVULSO').length;
    const alertas = base.length - faturaveis;

    const ids = {
        gmOsRiscoEstimado: moeda(fatTotal),
        gmOsTotal: base.length,
        gmOsFaturamento: faturaveis,
        gmOsAlertRecords: alertas
    };
    Object.entries(ids).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });

    const loss = document.getElementById('gmOsLossMetric');
    if (loss) loss.innerHTML = '<b style="color:#ef4444">' + moeda(perdaTotal) + '</b>';
    document.querySelectorAll('.valor-faturamento').forEach(el => el.innerText = moeda(fatTotal));
    document.querySelectorAll('.valor-perda').forEach(el => el.innerText = moeda(perdaTotal));
}

function group(base, fn) {
    return base.reduce((acc, item) => {
        const key = fn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

function renderPainel(base) {
    const host = ensureRoot();
    const fatTotal = base.reduce((a, b) => a + b.faturamento, 0);
    const perdaTotal = base.reduce((a, b) => a + b.perda, 0);
    const grupos = group(base, b => b.status);
    host.innerHTML = \`
        <section>
            <h2>FSM 360 - Governança Integrada Campinas</h2>
            <div class="fsm-grid">
                <div class="card-fsm"><span class="fsm-muted">Faturamento Real</span><h3>\${moeda(fatTotal)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Dreno Real de Margem</span><h3 style="color:#ef4444">\${moeda(perdaTotal)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">OS Processadas</span><h3>\${base.length}</h3></div>
            </div>
            <div class="card-fsm">
                <h3>Gavetas do Playbook</h3>
                \${Object.entries(grupos).map(([status, items]) => \`
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:8px 0;">
                        <span>\${status}</span><b>\${items.length} OS</b>
                    </div>
                \`).join('')}
            </div>
        </section>
    \`;
}

function renderOperacao(base, filtro) {
    const host = ensureRoot();
    const filtered = base.filter(item => {
        if (filtro === 'critical') return item.risk === 'critical';
        if (filtro && filtro !== 'all') return item.status === filtro;
        return true;
    });
    host.innerHTML = \`
        <section>
            <h2>Operação - Gestão de Fluxo</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button class="btn-fsm" onclick="filtrar('all')">Todas</button>
                <button class="btn-fsm" onclick="filtrar('critical')">Críticas</button>
                <button class="btn-fsm" onclick="filtrar('REINCIDÊNCIA TÉCNICA')">82 Reincidências</button>
                <button class="btn-fsm" onclick="filtrar('FATURÁVEL AVULSO')">Faturáveis</button>
                <button class="btn-fsm" onclick="filtrar('VINCULADA (SEM VALOR)')">Vinculadas</button>
            </div>
            <table class="fsm-table">
                <thead><tr><th>O.S.</th><th>Cliente</th><th>Status Real</th><th>Causa</th><th>Valor</th><th>Regra</th></tr></thead>
                <tbody>
                    \${filtered.slice(0, 120).map(b => \`
                        <tr>
                            <td><b>\${b.id}</b></td>
                            <td>\${String(b.cliente).substring(0, 38)}</td>
                            <td><span class="tag \${b.statusUi}">\${b.status}</span></td>
                            <td>\${b.causa}</td>
                            <td style="color:\${b.faturamento > 0 ? '#10b981' : '#94a3b8'}">\${moeda(b.faturamento)}</td>
                            <td><span class="fsm-muted">\${b.regra}</span></td>
                        </tr>
                    \`).join('')}
                </tbody>
            </table>
        </section>
    \`;
}

function renderAnaliseTecnica(base) {
    const host = ensureRoot();
    const ativos = Object.entries(group(base.filter(b => b.serial && b.serial !== 'S/N'), b => b.serial))
        .map(([serial, items]) => ({ serial, items }))
        .filter(row => row.items.length >= 2)
        .sort((a, b) => b.items.length - a.items.length);
    const parts = {};
    base.forEach(b => b.pecas.forEach(p => { parts[p] = (parts[p] || 0) + 1; }));
    const causas = group(base, b => b.causa);
    host.innerHTML = \`
        <section>
            <h2>Análise Técnica - Inteligência de Ativo</h2>
            <div class="fsm-grid">
                \${Object.entries(causas).sort((a,b)=>b[1].length-a[1].length).map(([causa, items]) => \`
                    <div class="card-fsm"><span class="fsm-muted">\${causa}</span><h3>\${items.length} OS</h3></div>
                \`).join('')}
            </div>
            <div class="card-fsm">
                <h3>Histórico por Serial</h3>
                \${ativos.slice(0, 10).map(row => \`
                    <div style="border-bottom:1px solid #334155; padding:8px 0;"><b>S/N: \${row.serial}</b><br><span class="fsm-muted">\${row.items.length} visitas | \${row.items[0].cliente}</span></div>
                \`).join('') || '<span class="fsm-muted">Nenhum ativo crítico pelo limite atual.</span>'}
            </div>
            <div class="card-fsm">
                <h3>Defeito vs. Peça</h3>
                \${Object.entries(parts).sort((a,b)=>b[1]-a[1]).slice(0, 10).map(([part, qtd]) => \`
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:7px 0;"><span>\${part}</span><b>\${qtd} trocas</b></div>
                \`).join('') || '<span class="fsm-muted">Sem peças detectadas.</span>'}
            </div>
        </section>
    \`;
}

function renderTecnicos(base) {
    const host = ensureRoot();
    const ranking = {};
    base.forEach(b => {
        if (!ranking[b.tecnico]) ranking[b.tecnico] = { total: 0, sucesso: 0, perda: 0, faturamento: 0 };
        ranking[b.tecnico].total++;
        ranking[b.tecnico].faturamento += b.faturamento;
        ranking[b.tecnico].perda += b.perda;
        if (b.status !== 'REINCIDÊNCIA TÉCNICA') ranking[b.tecnico].sucesso++;
    });
    host.innerHTML = \`
        <section>
            <h2>Técnicos - Resolvido de Primeira</h2>
            <div class="fsm-grid">
                \${Object.entries(ranking).sort((a,b)=>b[1].perda-a[1].perda).map(([nome, s]) => {
                    const taxa = s.total ? (s.sucesso / s.total) * 100 : 100;
                    return \`
                        <div class="card-tecnico">
                            <h3>\${nome}</h3>
                            <div style="font-size:28px; font-weight:bold; color:\${taxa >= 80 ? '#10b981' : taxa >= 60 ? '#f59e0b' : '#ef4444'}">\${taxa.toFixed(0)}%</div>
                            <small>Resolvido de Primeira</small>
                            <div class="fsm-muted" style="margin-top:8px;">\${s.total} OS | Retrabalho \${moeda(s.perda)} | Receita \${moeda(s.faturamento)}</div>
                        </div>
                    \`;
                }).join('')}
            </div>
        </section>
    \`;
}

function renderClientes(base) {
    const host = ensureRoot();
    const clients = {};
    base.forEach(b => {
        if (!clients[b.cliente]) clients[b.cliente] = { total: 0, perda: 0, faturamento: 0, infra: 0 };
        clients[b.cliente].total++;
        clients[b.cliente].perda += b.perda;
        clients[b.cliente].faturamento += b.faturamento;
        if (String(b.causa).includes('Infra') || String(b.causa).includes('Rede')) clients[b.cliente].infra++;
    });
    host.innerHTML = \`
        <section>
            <h2>Clientes - Saúde Contratual</h2>
            <p class="fsm-muted">Zonas de atrito como Solufarma/Bosch aparecem quando há dreno real ou recorrência de infraestrutura.</p>
            \${Object.entries(clients).filter(([, c]) => c.perda > 0 || c.infra >= 3).sort((a,b)=>b[1].perda-a[1].perda).slice(0, 15).map(([nome, c]) => {
                const impacto = c.faturamento ? (c.perda / c.faturamento) * 100 : 0;
                return \`
                    <div class="card-fsm" style="border-left:4px solid #ef4444;">
                        <b>\${nome}</b><br>
                        <span class="fsm-muted">\${c.total} OS | Infra/Rede \${c.infra} | Impacto \${impacto.toFixed(1)}%</span>
                        <div style="display:flex; justify-content:space-between; margin-top:8px;"><span>Receita \${moeda(c.faturamento)}</span><b style="color:#ef4444">Dreno \${moeda(c.perda)}</b></div>
                    </div>
                \`;
            }).join('')}
        </section>
    \`;
}

async function renderizarSistema(aba, filtro) {
    const dadosRaw = await getDados();
    const base = dadosRaw.map(processarRelatorioTagus);
    atualizarIndicadores(base);
    const alvo = slug(aba || 'painel-do-dia');
    if (alvo.includes('operacao')) return renderOperacao(base, filtro);
    if (alvo.includes('analise')) return renderAnaliseTecnica(base);
    if (alvo.includes('tecnico')) return renderTecnicos(base);
    if (alvo.includes('cliente')) return renderClientes(base);
    return renderPainel(base);
}

window.filtrar = function(filtro) {
    renderizarSistema('operacao', filtro);
};

window.switchTab = function(aba) {
    document.querySelectorAll('.menu-item, [data-aba]').forEach(el => {
        const id = el.getAttribute('data-aba') || slug(el.innerText);
        el.classList.toggle('active', id === slug(aba));
    });
    renderizarSistema(aba).catch(err => {
        console.error('Falha no alinhamento absoluto:', err);
        ensureRoot().innerHTML = '<div class="card-fsm">Erro ao carregar FSM: ' + err.message + '</div>';
    });
};

document.addEventListener('click', event => {
    const item = event.target.closest('.menu-item') || event.target.closest('[data-aba]');
    if (!item) return;
    event.preventDefault();
    switchTab(item.getAttribute('data-aba') || item.innerText);
});

window.onload = function() {
    ensureRoot();
    switchTab('painel-do-dia');
};
`;

fs.writeFileSync(appPath, masterAppJs, 'utf8');
console.log('Sistema Reconstruido com Sucesso. Governanca e Inteligencia alinhadas ao Playbook.');
