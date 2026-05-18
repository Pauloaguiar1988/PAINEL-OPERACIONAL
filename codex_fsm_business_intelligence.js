const fs = require('fs');
const path = require('path');

console.log('RECONSTRUINDO LOGICA DE NEGOCIO E CORRIGINDO INTERFACE...');

const appPath = path.join(__dirname, 'app.js');
const auditPath = path.join(__dirname, 'data', 'auditoria.json');

function norm(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function classificarNegocioServidor(dado) {
    const texto = norm([
        dado.observacao,
        dado.texto,
        dado.descricao,
        dado.servico_executado,
        dado.recommendation,
        dado.classificacao_original,
        dado.classificacao,
        dado.sourceFile,
        dado.modelo
    ].join(' '));

    if (/faturad[oa]\s+em\s+outra\s+os|faturad[oa]\s+em\s+outra\s+ose|cobrado\s+em\s+outra\s+os|os\s+vinculada/.test(texto)) {
        return {
            tipo: 'Vinculada (Aguardando Faturamento)',
            valor: 0,
            perda: 0,
            motivo: 'Faturamento direcionado para outra OS'
        };
    }

    if (/preventiva|manutencao preventiva|contrato ativo/.test(texto) && !/retorno|reincidencia|garantia servico/.test(texto)) {
        return {
            tipo: 'Preventiva (Contrato)',
            valor: 0,
            perda: 0,
            motivo: 'Atendimento coberto por contrato/receita recorrente'
        };
    }

    if (dado.classificacao === 'Garantia Serviço' || dado.isRecurrent === true || /abrir retorno|retorno tecnico|reincidencia|garantia de instalacao/.test(texto)) {
        return {
            tipo: 'Garantia Serviço',
            valor: 0,
            perda: 281,
            motivo: 'Retrabalho sem faturamento avulso'
        };
    }

    if (dado.classificacao === 'Garantia Fábrica' || /garantia de fabrica|garantia fabricante/.test(texto)) {
        return {
            tipo: 'Garantia Fábrica',
            valor: 281,
            perda: 0,
            motivo: 'Deslocamento em garantia de fabrica'
        };
    }

    return {
        tipo: 'Faturável',
        valor: 498,
        perda: 0,
        motivo: 'Faturamento avulso'
    };
}

function recalibrarBase() {
    if (!fs.existsSync(auditPath)) return {};
    const dados = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const atualizados = dados.map(item => {
        const negocio = classificarNegocioServidor(item);
        return {
            ...item,
            classificacao: negocio.tipo,
            valorEstimado: negocio.valor,
            perdaEstimativa: negocio.perda,
            businessRule: negocio.motivo,
            isRecurrent: negocio.tipo === 'Garantia Serviço'
        };
    });

    fs.writeFileSync(auditPath, JSON.stringify(atualizados, null, 2), 'utf8');

    return atualizados.reduce((acc, item) => {
        acc[item.classificacao] = (acc[item.classificacao] || 0) + 1;
        return acc;
    }, {});
}

const businessAppJs = `
function injectBusinessStyle() {
    if (document.getElementById('fsm-business-style')) return;
    const style = document.createElement('style');
    style.id = 'fsm-business-style';
    style.innerHTML = \`
        body { overflow-x:hidden; background:#020617; }
        .sidebar { position:fixed; left:0; top:0; width:260px; height:100vh; z-index:100; background:#0f172a; overflow-y:auto; }
        .main-content, #fsm-layout-root { margin-left:260px; width:calc(100% - 260px); min-height:100vh; padding:20px; box-sizing:border-box; color:#e5e7eb; }
        #fsm-view-host { max-width:1440px; margin:0 auto; }
        .card-fsm { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:16px; margin-bottom:12px; }
        .tag { display:inline-block; border:1px solid #334155; background:#0f172a; border-radius:999px; padding:3px 8px; font-size:12px; }
        .btn-fsm { border:1px solid #334155; background:#0f172a; color:#e5e7eb; border-radius:999px; padding:8px 12px; cursor:pointer; }
        .fsm-table { width:100%; border-collapse:collapse; background:#1e293b; border-radius:8px; overflow:hidden; }
        .fsm-table td, .fsm-table th { padding:10px; border-bottom:1px solid #334155; text-align:left; vertical-align:top; }
        .fsm-muted { color:#94a3b8; font-size:12px; }
        .menu-item.active, [data-aba].active { background:#2563eb !important; color:white !important; }
        @media (max-width:900px) { .sidebar { position:relative; width:100%; height:auto; } .main-content, #fsm-layout-root { margin-left:0; width:100%; padding:12px; } }
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
    injectBusinessStyle();
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

function atualizarTopo(dados) {
    const faturamento = dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0);
    const perda = dados.reduce((a, b) => a + Number(b.perdaEstimativa || 0), 0);
    const ids = {
        gmOsRiscoEstimado: moeda(faturamento),
        gmOsTotal: dados.length,
        gmOsFaturamento: dados.filter(d => d.classificacao === 'Faturável').length,
        gmOsAlertRecords: dados.filter(d => d.classificacao !== 'Faturável').length
    };
    Object.entries(ids).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });
    document.querySelectorAll('.valor-faturamento').forEach(el => el.innerText = moeda(faturamento));
    document.querySelectorAll('.valor-perda').forEach(el => el.innerText = moeda(perda));
}

function renderPainel(dados) {
    const host = ensureRoot();
    const faturamento = dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0);
    const perda = dados.reduce((a, b) => a + Number(b.perdaEstimativa || 0), 0);
    const grupos = dados.reduce((acc, item) => {
        acc[item.classificacao] = (acc[item.classificacao] || 0) + 1;
        return acc;
    }, {});
    host.innerHTML = \`
        <section>
            <h2>Painel do Dia</h2>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;">
                <div class="card-fsm"><span class="fsm-muted">Faturamento Avulso/Garantia</span><h3>\${moeda(faturamento)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Perda Retrabalho</span><h3 style="color:#ef4444">\${moeda(perda)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">OS</span><h3>\${dados.length}</h3></div>
            </div>
            <div class="card-fsm">
                <h3>Classificação de Negócio</h3>
                \${Object.entries(grupos).map(([k, v]) => '<div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:8px 0;"><span>' + k + '</span><b>' + v + ' OS</b></div>').join('')}
            </div>
        </section>
    \`;
}

function renderOperacao(dados, filtro) {
    const host = ensureRoot();
    const filtrados = dados.filter(d => {
        if (filtro === 'critical') return d.riskLevel === 'critical';
        if (filtro === 'Garantia Serviço') return d.classificacao === 'Garantia Serviço';
        if (filtro === 'Faturável') return d.classificacao === 'Faturável';
        if (filtro === 'Preventiva (Contrato)') return d.classificacao === 'Preventiva (Contrato)';
        if (filtro === 'Vinculada (Aguardando Faturamento)') return d.classificacao === 'Vinculada (Aguardando Faturamento)';
        return true;
    });
    host.innerHTML = \`
        <section>
            <h2>Operação</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button onclick="filtrar('all')" class="btn-fsm">Todas</button>
                <button onclick="filtrar('critical')" class="btn-fsm">Críticas</button>
                <button onclick="filtrar('Garantia Serviço')" class="btn-fsm">Retrabalhos</button>
                <button onclick="filtrar('Faturável')" class="btn-fsm">Faturáveis</button>
                <button onclick="filtrar('Preventiva (Contrato)')" class="btn-fsm">Preventivas</button>
                <button onclick="filtrar('Vinculada (Aguardando Faturamento)')" class="btn-fsm">Vinculadas</button>
            </div>
            <table class="fsm-table">
                <thead><tr><th>O.S.</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Regra</th></tr></thead>
                <tbody id="fsm-body-table">
                    \${filtrados.slice(0, 80).map(d => \`
                        <tr>
                            <td><b>\${d.os_numero || 'S/N'}</b></td>
                            <td>\${String(d.cliente || 'Cliente').substring(0, 34)}</td>
                            <td><span class="tag">\${d.classificacao || 'N/A'}</span></td>
                            <td style="color:\${Number(d.valorEstimado || 0) > 0 ? '#10b981' : '#94a3b8'}">\${moeda(d.valorEstimado)}</td>
                            <td><span class="fsm-muted">\${d.businessRule || '-'}</span></td>
                        </tr>
                    \`).join('')}
                </tbody>
            </table>
        </section>
    \`;
}

function renderTecnicos(dados) {
    const host = ensureRoot();
    const techs = {};
    dados.forEach(d => {
        const t = d.tecnico || 'N/A';
        if (!techs[t]) techs[t] = { total: 0, resolvidoPrimeira: 0, faturamento: 0 };
        techs[t].total++;
        techs[t].faturamento += Number(d.valorEstimado || 0);
        if (d.classificacao !== 'Garantia Serviço') techs[t].resolvidoPrimeira++;
    });
    host.innerHTML = '<section><h2>Técnicos</h2><div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px;">' +
        Object.entries(techs).sort((a,b)=>b[1].faturamento-a[1].faturamento).map(([nome,s]) => {
            const taxa = s.total ? (s.resolvidoPrimeira / s.total) * 100 : 100;
            return '<div class="card-fsm"><h4>' + nome + '</h4><div style="font-size:28px; font-weight:bold; color:' + (taxa > 80 ? '#10b981' : taxa >= 60 ? '#f59e0b' : '#ef4444') + '">' + taxa.toFixed(0) + '%</div><small>Resolvido de Primeira</small><div class="fsm-muted" style="margin-top:8px;">' + s.total + ' OS | ' + moeda(s.faturamento) + '</div></div>';
        }).join('') + '</div></section>';
}

function renderClientes(dados) {
    const host = ensureRoot();
    const clients = {};
    dados.forEach(d => {
        const c = d.cliente || 'N/A';
        if (!clients[c]) clients[c] = { total: 0, perda: 0, faturamento: 0 };
        clients[c].total++;
        clients[c].faturamento += Number(d.valorEstimado || 0);
        clients[c].perda += Number(d.perdaEstimativa || 0);
    });
    host.innerHTML = '<section><h2>Clientes</h2><p class="fsm-muted">Mostra contratos onde a operação está drenando margem.</p>' +
        Object.entries(clients).filter(([,s])=>s.perda>0).sort((a,b)=>b[1].perda-a[1].perda).slice(0,15).map(([nome,s]) => {
            const impacto = s.faturamento ? (s.perda / s.faturamento) * 100 : 0;
            return '<div class="card-fsm" style="border-left:4px solid #ef4444;"><b>' + nome + '</b><br><span class="fsm-muted">' + s.total + ' OS | impacto ' + impacto.toFixed(1) + '%</span><div style="display:flex; justify-content:space-between; margin-top:8px;"><span>' + moeda(s.faturamento) + '</span><b style="color:#ef4444">Perda ' + moeda(s.perda) + '</b></div></div>';
        }).join('') + '</section>';
}

function renderAnalise(dados) {
    const host = ensureRoot();
    const causas = dados.reduce((acc,d)=>{ const c=d.causaRaizForense || d.probableCause || 'sem_diagnostico'; acc[c]=(acc[c]||0)+1; return acc; }, {});
    host.innerHTML = '<section><h2>Análise Técnica</h2><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px;">' +
        Object.entries(causas).sort((a,b)=>b[1]-a[1]).map(([c,q]) => '<div class="card-fsm"><span class="fsm-muted">' + c + '</span><h3>' + q + ' OS</h3></div>').join('') +
        '</div></section>';
}

async function carregar(aba, filtro) {
    try {
        const dados = await getDados();
        atualizarTopo(dados);
        if (aba === 'operacao') return renderOperacao(dados, filtro);
        if (aba === 'tecnicos') return renderTecnicos(dados);
        if (aba === 'clientes') return renderClientes(dados);
        if (aba === 'analise-tecnica') return renderAnalise(dados);
        return renderPainel(dados);
    } catch (e) {
        console.error('Erro ao renderizar aba:', e);
        ensureRoot().innerHTML = '<div class="card-fsm">Erro ao carregar dados: ' + e.message + '</div>';
    }
}

async function getDados() {
    const res = await fetch('/api/dashboard/tabela', { cache:'no-store' });
    const dados = await res.json();
    return Array.isArray(dados) ? dados : [];
}

window.filtrar = function(filtro) {
    carregar('operacao', filtro);
};

window.switchTab = function(abaId) {
    try {
        const aba = slug(abaId);
        document.querySelectorAll('.menu-item, [data-aba]').forEach(el => {
            const id = el.getAttribute('data-aba') || slug(el.innerText);
            el.classList.toggle('active', id === aba);
        });
        if (aba.includes('tecnico')) return carregar('tecnicos');
        if (aba.includes('cliente')) return carregar('clientes');
        if (aba.includes('analise')) return carregar('analise-tecnica');
        if (aba.includes('operacao')) return carregar('operacao');
        return carregar('painel-do-dia');
    } catch (e) {
        console.error('Erro ao trocar aba:', e);
    }
};

document.addEventListener('click', e => {
    const item = e.target.closest('.menu-item') || e.target.closest('[data-aba]');
    if (!item) return;
    e.preventDefault();
    switchTab(item.getAttribute('data-aba') || item.innerText);
});

window.onload = function() {
    ensureRoot();
    switchTab('Painel do Dia');
};
`;

const resumo = recalibrarBase();
fs.writeFileSync(appPath, businessAppJs, 'utf8');

console.log('Logica de Negocio (Preventivas/Vinculadas) e Navegacao estabilizadas.');
console.log(`Resumo de negocio: ${JSON.stringify(resumo)}`);
