const fs = require('fs');
const path = require('path');

console.log('ATIVANDO O MOTOR DE VERDADE INTEGRAL (FSM 360)...');

const appPath = path.join(__dirname, 'app.js');

const finalMasterJs = `
function injectMasterStyle() {
    if (document.getElementById('fsm-master-style')) return;
    const style = document.createElement('style');
    style.id = 'fsm-master-style';
    style.innerHTML = \`
        body { overflow-x:hidden; background:#020617; }
        .sidebar { position:fixed; left:0; top:0; width:260px; height:100vh; z-index:100; background:#0f172a; overflow-y:auto; }
        .main-content, #fsm-layout-root { margin-left:260px; width:calc(100% - 260px); min-height:100vh; padding:20px; box-sizing:border-box; color:#e5e7eb; }
        #fsm-view-host { max-width:1440px; margin:0 auto; }
        .fsm-card { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:16px; margin-bottom:12px; }
        .fsm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }
        .fsm-table { width:100%; border-collapse:collapse; background:#1e293b; border-radius:8px; overflow:hidden; }
        .fsm-table th, .fsm-table td { padding:10px; border-bottom:1px solid #334155; text-align:left; vertical-align:top; }
        .fsm-muted { color:#94a3b8; font-size:12px; }
        .fsm-tag { display:inline-block; border:1px solid #334155; background:#0f172a; border-radius:999px; padding:3px 8px; font-size:12px; }
        .fsm-tag.primary { border-color:#10b981; color:#bbf7d0; }
        .fsm-tag.error { border-color:#ef4444; color:#fca5a5; }
        .fsm-tag.info { border-color:#60a5fa; color:#bfdbfe; }
        .fsm-tag.success { border-color:#10b981; color:#86efac; }
        .fsm-tag.warning { border-color:#f59e0b; color:#fde68a; }
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
    injectMasterStyle();
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
    const res = await fetch('/api/dashboard/tabela', { cache: 'no-store' });
    const dados = await res.json();
    return Array.isArray(dados) ? dados : [];
}

function processarRelatorioIntegral(d) {
    return {
        id: d.os_numero || 'S/N',
        cliente: d.cliente || 'CLIENTE NAO IDENTIFICADO',
        tecnico: d.tecnico || 'TECNICO NAO IDENTIFICADO',
        serial: d.serial || 'S/N',
        categoria: d.truthLabel || d.classificacao || 'Sem regra',
        status: d.truthStatus || 'primary',
        valor: Number(d.truthValue ?? d.valorEstimado ?? 0),
        perda: Number(d.truthLoss ?? d.perdaEstimativa ?? 0),
        causa: d.causaRaizForense || d.probableCause || 'Sem diagnostico',
        pecaCount: Array.isArray(d.pecas) ? d.pecas.length : 0,
        pecas: Array.isArray(d.pecas) ? d.pecas : [],
        risk: d.riskLevel || 'low',
        reason: d.truthReason || d.businessRule || d.recommendation || '-',
        source: d.sourceFile || ''
    };
}

function stats(base) {
    return {
        total: base.length,
        faturamento: base.reduce((acc, item) => acc + item.valor, 0),
        perda: base.reduce((acc, item) => acc + item.perda, 0),
        vinculadas: base.filter(item => item.categoria === 'VINCULADA (SEM VALOR)').length,
        preventivas: base.filter(item => item.categoria === 'PREVENTIVA (CONTRATO)').length,
        reincidencias: base.filter(item => item.categoria === 'REINCIDÊNCIA TÉCNICA').length,
        faturaveis: base.filter(item => item.categoria === 'FATURÁVEL AVULSO').length
    };
}

function atualizarWidgets(base) {
    const s = stats(base);
    const map = {
        gmOsRiscoEstimado: moeda(s.faturamento),
        gmOsTotal: s.total,
        gmOsFaturamento: s.faturaveis,
        gmOsAlertRecords: s.reincidencias + s.vinculadas + s.preventivas
    };

    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });

    document.querySelectorAll('.valor-faturamento').forEach(el => { el.innerText = moeda(s.faturamento); });
    document.querySelectorAll('.valor-perda').forEach(el => { el.innerText = moeda(s.perda); });
}

function groupBy(base, fn) {
    return base.reduce((acc, item) => {
        const key = fn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

function renderPainel(base) {
    const host = ensureRoot();
    const s = stats(base);
    const porCategoria = groupBy(base, item => item.categoria);
    host.innerHTML = \`
        <section>
            <h2>FSM 360 - Painel do Dia</h2>
            <div class="fsm-grid">
                <div class="fsm-card"><span class="fsm-muted">Faturamento Real</span><h3>\${moeda(s.faturamento)}</h3></div>
                <div class="fsm-card"><span class="fsm-muted">Perda Real</span><h3 style="color:#ef4444">\${moeda(s.perda)}</h3></div>
                <div class="fsm-card"><span class="fsm-muted">Preventivas</span><h3>\${s.preventivas}</h3></div>
                <div class="fsm-card"><span class="fsm-muted">Vinculadas</span><h3>\${s.vinculadas}</h3></div>
            </div>
            <div class="fsm-card">
                <h3>Classificação Operacional</h3>
                \${Object.entries(porCategoria).map(([categoria, itens]) => \`
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:8px 0;">
                        <span>\${categoria}</span><b>\${itens.length} OS</b>
                    </div>
                \`).join('')}
            </div>
        </section>
    \`;
}

function renderOperacao(base) {
    const host = ensureRoot();
    host.innerHTML = \`
        <section>
            <h2>Operação</h2>
            <table class="fsm-table">
                <thead><tr><th>O.S.</th><th>Cliente</th><th>Categoria</th><th>Causa</th><th>Valor</th><th>Regra</th></tr></thead>
                <tbody>
                    \${base.slice(0, 120).map(item => \`
                        <tr>
                            <td><b>\${item.id}</b></td>
                            <td>\${String(item.cliente).substring(0, 36)}</td>
                            <td><span class="fsm-tag \${item.status}">\${item.categoria}</span></td>
                            <td>\${item.causa}</td>
                            <td style="color:\${item.valor > 0 ? '#10b981' : '#94a3b8'}">\${moeda(item.valor)}</td>
                            <td><span class="fsm-muted">\${item.reason}</span></td>
                        </tr>
                    \`).join('')}
                </tbody>
            </table>
        </section>
    \`;
}

function renderAnaliseTecnica(base) {
    const host = ensureRoot();
    const porCausa = groupBy(base, item => item.causa);
    const parts = {};
    base.forEach(item => item.pecas.forEach(p => { parts[p] = (parts[p] || 0) + 1; }));
    const ativosCriticos = Object.entries(groupBy(base.filter(item => item.serial !== 'S/N'), item => item.serial))
        .map(([serial, items]) => ({ serial, items }))
        .filter(row => row.items.length >= 3)
        .sort((a, b) => b.items.length - a.items.length);

    host.innerHTML = \`
        <section>
            <h2>Análise Técnica</h2>
            <div class="fsm-grid">
                \${Object.entries(porCausa).sort((a, b) => b[1].length - a[1].length).map(([causa, items]) => \`
                    <div class="fsm-card"><span class="fsm-muted">\${causa}</span><h3>\${items.length} OS</h3></div>
                \`).join('')}
            </div>
            <div class="fsm-card">
                <h3>Top Peças</h3>
                \${Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([peca, qtd]) => \`
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:7px 0;"><span>\${peca}</span><b>\${qtd} un</b></div>
                \`).join('') || '<span class="fsm-muted">Sem peças mapeadas.</span>'}
            </div>
            <div class="fsm-card">
                <h3>Ativos Críticos por Serial</h3>
                \${ativosCriticos.slice(0, 10).map(row => \`
                    <div style="border-bottom:1px solid #334155; padding:7px 0;"><b>\${row.serial}</b><br><span class="fsm-muted">\${row.items.length} visitas | \${row.items[0].cliente}</span></div>
                \`).join('') || '<span class="fsm-muted">Nenhum ativo acima do limite.</span>'}
            </div>
        </section>
    \`;
}

function renderTecnicos(base) {
    const host = ensureRoot();
    const techs = {};
    base.forEach(item => {
        const t = item.tecnico || 'N/A';
        if (!techs[t]) techs[t] = { total: 0, primeira: 0, faturamento: 0, complexidade: 0 };
        techs[t].total += 1;
        techs[t].faturamento += item.valor;
        if (item.categoria !== 'REINCIDÊNCIA TÉCNICA') techs[t].primeira += 1;
        if (item.causa === 'Falha de Componente' || item.pecaCount > 0) techs[t].complexidade += 1;
    });

    host.innerHTML = \`
        <section>
            <h2>Técnicos</h2>
            <div class="fsm-grid">
                \${Object.entries(techs).sort((a,b)=>b[1].faturamento-a[1].faturamento).map(([nome, t]) => {
                    const taxa = t.total ? (t.primeira / t.total) * 100 : 100;
                    const eficiencia = taxa + Math.min(t.complexidade, 20);
                    return \`
                        <div class="fsm-card">
                            <h3>\${nome}</h3>
                            <div style="font-size:28px; font-weight:bold; color:\${taxa >= 80 ? '#10b981' : taxa >= 60 ? '#f59e0b' : '#ef4444'}">\${taxa.toFixed(0)}%</div>
                            <small>Resolvido de Primeira</small>
                            <div class="fsm-muted" style="margin-top:8px;">\${t.total} OS | Eficiência \${eficiencia.toFixed(0)} | \${moeda(t.faturamento)}</div>
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
    base.forEach(item => {
        const c = item.cliente || 'N/A';
        if (!clients[c]) clients[c] = { total: 0, perda: 0, faturamento: 0 };
        clients[c].total += 1;
        clients[c].perda += item.perda;
        clients[c].faturamento += item.valor;
    });

    host.innerHTML = \`
        <section>
            <h2>Clientes</h2>
            <p class="fsm-muted">Dreno real de margem, já removendo OS vinculada e preventiva.</p>
            \${Object.entries(clients).filter(([, c]) => c.perda > 0).sort((a,b)=>b[1].perda-a[1].perda).slice(0, 15).map(([nome, c]) => {
                const impacto = c.faturamento ? (c.perda / c.faturamento) * 100 : 0;
                return \`
                    <div class="fsm-card" style="border-left:4px solid #ef4444;">
                        <b>\${nome}</b><br>
                        <span class="fsm-muted">\${c.total} OS | Impacto \${impacto.toFixed(1)}%</span>
                        <div style="display:flex; justify-content:space-between; margin-top:8px;"><span>\${moeda(c.faturamento)}</span><b style="color:#ef4444">Perda \${moeda(c.perda)}</b></div>
                    </div>
                \`;
            }).join('')}
        </section>
    \`;
}

async function atualizarTudo(aba) {
    const raw = await getDados();
    const base = raw.map(processarRelatorioIntegral);
    atualizarWidgets(base);
    const alvo = slug(aba || 'painel-do-dia');
    if (alvo.includes('operacao')) return renderOperacao(base);
    if (alvo.includes('analise')) return renderAnaliseTecnica(base);
    if (alvo.includes('tecnico')) return renderTecnicos(base);
    if (alvo.includes('cliente')) return renderClientes(base);
    return renderPainel(base);
}

window.switchTab = function(aba) {
    document.querySelectorAll('.menu-item, [data-aba]').forEach(el => {
        const id = el.getAttribute('data-aba') || slug(el.innerText);
        el.classList.toggle('active', id === slug(aba));
    });
    atualizarTudo(aba).catch(err => {
        console.error('Falha no Master Engine:', err);
        ensureRoot().innerHTML = '<div class="fsm-card">Erro ao carregar FSM 360: ' + err.message + '</div>';
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

fs.writeFileSync(appPath, finalMasterJs, 'utf8');
console.log('Master Engine Injetada. Sistema pronto para governanca total.');
