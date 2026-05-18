const fs = require('fs');
const path = require('path');

console.log('RECALIBRANDO IA E RESTRUTURANDO INTERFACE...');

const appPath = path.join(__dirname, 'app.js');
const auditPath = path.join(__dirname, 'data', 'auditoria.json');

function normalizar(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function causaForenseServidor(dado) {
    const texto = normalizar([
        dado.texto,
        dado.descricao,
        dado.servico_executado,
        dado.recommendation,
        dado.modelo,
        dado.sourceFile,
        (dado.pecas || []).join(' ')
    ].join(' '));

    if ((dado.pecas || []).length > 0 || /troca|substitu|placa|sensor|leitor|display|fonte|rele|mecanismo|componente|hardware/.test(texto)) {
        return 'Falha de Componente';
    }

    if (/offline|ip|ping|rede|comunicacao|gateway|dns|vpn|firewall|internet|conexao/.test(texto)) {
        return 'Instabilidade de Rede';
    }

    if (/orientado|treinamento|uso indevido|operador|procedimento|usuario/.test(texto)) {
        return 'Uso Operacional';
    }

    if (/configuracao|ajuste|software|firmware|parametro|cadastro|senha/.test(texto)) {
        return 'Ajuste de Configuracao';
    }

    return 'Analise de Infraestrutura';
}

function atualizarTaxonomiaForense() {
    if (!fs.existsSync(auditPath)) return {};
    const dados = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const atualizados = dados.map(item => {
        const causaRaiz = causaForenseServidor(item);
        const mapa = {
            'Falha de Componente': 'falha_hardware',
            'Instabilidade de Rede': 'falha_comunicacao',
            'Uso Operacional': 'erro_operacional',
            'Ajuste de Configuracao': 'ajuste_configuracao',
            'Analise de Infraestrutura': 'infraestrutura_cliente'
        };

        return {
            ...item,
            causaRaizForense: causaRaiz,
            probableCause: mapa[causaRaiz] || 'infraestrutura_cliente',
            taxonomyVersion: 'forense-v2'
        };
    });

    fs.writeFileSync(auditPath, JSON.stringify(atualizados, null, 2), 'utf8');
    return atualizados.reduce((acc, item) => {
        acc[item.causaRaizForense] = (acc[item.causaRaizForense] || 0) + 1;
        return acc;
    }, {});
}

const v2AppJs = `
function injectFSMStyle() {
    if (document.getElementById('fsm-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'fsm-v2-style';
    style.innerHTML = \`
        body { overflow-x:hidden; background:#020617; }
        .sidebar { position:fixed; left:0; top:0; width:260px; height:100vh; z-index:100; background:#0f172a; overflow-y:auto; }
        .main-content, #fsm-layout-root { margin-left:260px; width:calc(100% - 260px); min-height:100vh; padding:20px; box-sizing:border-box; color:#e5e7eb; }
        #fsm-top-nav { display:none !important; }
        #fsm-view-host { max-width:1440px; margin:0 auto; }
        .fsm-tabs { display:none; }
        .card-fsm { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:16px; }
        .btn-fsm { border:1px solid #334155; background:#0f172a; color:#e5e7eb; border-radius:999px; padding:8px 12px; cursor:pointer; }
        .btn-fsm.red { border-color:#ef4444; color:#fca5a5; }
        .btn-fsm.orange { border-color:#f59e0b; color:#fcd34d; }
        .tag { display:inline-block; background:#0f172a; border:1px solid #334155; border-radius:999px; padding:3px 8px; font-size:12px; }
        .fsm-table { width:100%; border-collapse:collapse; background:#1e293b; border-radius:8px; overflow:hidden; }
        .fsm-table th, .fsm-table td { padding:12px; border-bottom:1px solid #334155; text-align:left; vertical-align:top; }
        .fsm-muted { color:#94a3b8; font-size:12px; }
        .menu-item.active, [data-aba].active { background:#2563eb !important; color:white !important; }
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

function isRetorno(d) {
    return d.isRecurrent === true || d.classificacao === 'Garantia Serviço';
}

function analisarCausaForense(dado) {
    return dado.causaRaizForense || 'Análise de Infraestrutura';
}

function ensureRoot() {
    injectFSMStyle();
    let root = document.getElementById('fsm-layout-root') || document.querySelector('.main-content');
    if (!root) {
        root = document.createElement('main');
        document.body.appendChild(root);
    }
    root.id = 'fsm-layout-root';
    root.classList.add('main-content');
    root.innerHTML = '<div id="fsm-view-host"><div id="fsm-view-content"></div></div>';
    return document.getElementById('fsm-view-content');
}

async function fetchDados() {
    const res = await fetch('/api/dashboard/tabela', { cache:'no-store' });
    const dados = await res.json();
    return Array.isArray(dados) ? dados : [];
}

function atualizarTopo(dados) {
    const faturamento = dados.reduce((a, b) => a + Number(b.valorEstimado || 0), 0);
    const perda = dados.filter(d => d.classificacao === 'Garantia Serviço').length * 281;
    const map = {
        gmOsRiscoEstimado: moeda(faturamento),
        gmOsTotal: dados.length,
        gmOsFaturamento: dados.filter(d => d.classificacao === 'Faturável').length,
        gmOsAlertRecords: dados.filter(d => d.classificacao !== 'Faturável').length
    };
    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });
    document.querySelectorAll('.valor-faturamento').forEach(el => el.innerText = moeda(faturamento));
    document.querySelectorAll('.valor-perda').forEach(el => el.innerText = moeda(perda));
}

function renderOperacao(dados, filtroAtual) {
    const container = document.getElementById('fsm-view-content');
    if (!container) return;
    const filtro = filtroAtual || 'all';
    const filtrados = dados.filter(d => {
        if (filtro === 'critical') return d.riskLevel === 'critical';
        if (filtro === 'Garantia Serviço') return d.classificacao === 'Garantia Serviço';
        if (filtro === 'Faturável') return d.classificacao === 'Faturável';
        return true;
    });

    container.innerHTML = \`
        <section>
            <h2>Operação</h2>
            <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
                <button onclick="filtrar('all')" class="btn-fsm">Todas</button>
                <button onclick="filtrar('critical')" class="btn-fsm red">Críticas</button>
                <button onclick="filtrar('Garantia Serviço')" class="btn-fsm orange">Retrabalhos</button>
                <button onclick="filtrar('Faturável')" class="btn-fsm">Faturáveis</button>
            </div>
            <table class="fsm-table">
                <thead><tr><th>O.S.</th><th>Cliente</th><th>Técnico</th><th>Causa Raiz</th><th>Status</th><th>Valor</th></tr></thead>
                <tbody>
                    \${filtrados.slice(0, 80).map(d => \`
                        <tr>
                            <td><b>\${d.os_numero || 'S/N'}</b></td>
                            <td>\${String(d.cliente || 'Cliente').substring(0, 38)}</td>
                            <td>\${d.tecnico || 'N/A'}</td>
                            <td><span class="tag">\${analisarCausaForense(d)}</span></td>
                            <td>\${d.classificacao || 'N/A'}<br><span class="fsm-muted">\${d.riskLevel || 'low'}</span></td>
                            <td>\${moeda(d.valorEstimado)}</td>
                        </tr>
                    \`).join('')}
                </tbody>
            </table>
        </section>
    \`;
}

function renderTecnicos(dados) {
    const container = document.getElementById('fsm-view-content');
    if (!container) return;
    const techs = {};
    dados.forEach(d => {
        const t = d.tecnico || 'N/A';
        if (!techs[t]) techs[t] = { total: 0, resolvidoPrimeira: 0, faturamento: 0 };
        techs[t].total++;
        techs[t].faturamento += Number(d.valorEstimado || 0);
        if (!isRetorno(d)) techs[t].resolvidoPrimeira++;
    });

    container.innerHTML = \`
        <section>
            <h2>Técnicos</h2>
            <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px;">
                \${Object.entries(techs).sort((a,b) => b[1].faturamento - a[1].faturamento).map(([nome, s]) => {
                    const taxa = s.total ? ((s.resolvidoPrimeira / s.total) * 100) : 100;
                    return \`
                        <div class="card-fsm">
                            <h4>\${nome}</h4>
                            <div style="font-size:28px; font-weight:bold; color:\${taxa > 80 ? '#10b981' : taxa >= 60 ? '#f59e0b' : '#ef4444'}">\${taxa.toFixed(0)}%</div>
                            <small>Resolvido de Primeira</small>
                            <div style="background:#334155; height:6px; border-radius:3px; margin-top:10px; overflow:hidden;">
                                <div style="width:\${taxa}%; height:100%; background:#3b82f6;"></div>
                            </div>
                            <div class="fsm-muted" style="margin-top:8px;">\${s.total} OS | \${moeda(s.faturamento)}</div>
                        </div>
                    \`;
                }).join('')}
            </div>
        </section>
    \`;
}

function renderAnaliseTecnica(dados) {
    const container = document.getElementById('fsm-view-content');
    if (!container) return;
    const causas = dados.reduce((acc, d) => {
        const c = analisarCausaForense(d);
        acc[c] = (acc[c] || 0) + 1;
        return acc;
    }, {});
    const pecas = {};
    dados.forEach(d => (d.pecas || []).forEach(p => pecas[p] = (pecas[p] || 0) + 1));

    container.innerHTML = \`
        <section>
            <h2>Análise Técnica</h2>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;">
                \${Object.entries(causas).sort((a,b)=>b[1]-a[1]).map(([c,q]) => \`
                    <div class="card-fsm"><span class="fsm-muted">\${c}</span><h3>\${q} OS</h3></div>
                \`).join('')}
            </div>
            <div class="card-fsm" style="margin-top:16px;">
                <h3>Top 10 Peças Mais Trocadas</h3>
                \${Object.entries(pecas).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([p,q]) => \`
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:7px 0;">
                        <span>\${p}</span><b>\${q} un</b>
                    </div>
                \`).join('') || '<span class="fsm-muted">Sem peças mapeadas.</span>'}
            </div>
        </section>
    \`;
}

function renderClientes(dados) {
    const container = document.getElementById('fsm-view-content');
    if (!container) return;
    const clients = {};
    dados.forEach(d => {
        const c = d.cliente || 'N/A';
        if (!clients[c]) clients[c] = { total: 0, perda: 0, faturamento: 0 };
        clients[c].total++;
        clients[c].faturamento += Number(d.valorEstimado || 0);
        if (isRetorno(d)) clients[c].perda += 281;
    });

    container.innerHTML = \`
        <section>
            <h2>Clientes</h2>
            <p class="fsm-muted">Aba para comercial/faturamento: mostra contratos onde a operação está pagando para trabalhar.</p>
            \${Object.entries(clients).filter(([,s]) => s.perda > 0).sort((a,b)=>b[1].perda-a[1].perda).slice(0,15).map(([nome,s]) => {
                const impacto = s.faturamento ? (s.perda / s.faturamento) * 100 : 0;
                return \`
                    <div class="card-fsm" style="border-left:4px solid #ef4444;">
                        <b>\${nome}</b><br>
                        <span class="fsm-muted">\${s.total} OS | Impacto \${impacto.toFixed(1)}%</span>
                        <div style="display:flex; justify-content:space-between; margin-top:8px;">
                            <span>\${moeda(s.faturamento)}</span>
                            <b style="color:#ef4444">Perda \${moeda(s.perda)}</b>
                        </div>
                    </div>
                \`;
            }).join('')}
        </section>
    \`;
}

function renderGovernanca(dados) {
    const container = document.getElementById('fsm-view-content');
    if (!container) return;
    const fila = dados.filter(d => d.riskLevel === 'critical' || Number(d.confidence || 0) < 85);
    container.innerHTML = \`
        <section>
            <h2>Governança</h2>
            <div class="card-fsm"><b>\${fila.length}</b> OS aguardam revisão técnica.</div>
            \${fila.slice(0,50).map(d => \`
                <div class="card-fsm" style="border-left:4px solid #ef4444;">
                    <b>\${d.os_numero || 'S/N'}</b> - \${d.cliente || 'Cliente'}<br>
                    <span class="fsm-muted">\${d.recommendation || 'Sem recomendação'}</span>
                </div>
            \`).join('')}
        </section>
    \`;
}

async function carregar(aba, filtro) {
    const dados = await fetch('/api/dashboard/tabela', { cache:'no-store' }).then(r => r.json());
    atualizarTopo(dados);
    if (aba === 'operacao') return renderOperacao(dados, filtro);
    if (aba === 'tecnicos') return renderTecnicos(dados);
    if (aba === 'analise-tecnica') return renderAnaliseTecnica(dados);
    if (aba === 'clientes') return renderClientes(dados);
    if (aba === 'governanca' || aba === 'laudo-qualidade') return renderGovernanca(dados);
    return renderOperacao(dados, filtro);
}

window.filtrar = function(filtro) {
    carregar('operacao', filtro);
};

window.switchTab = function(abaTexto) {
    const aba = slug(abaTexto);
    document.querySelectorAll('.menu-item, [data-aba]').forEach(el => {
        const id = el.getAttribute('data-aba') || slug(el.innerText);
        el.classList.toggle('active', id === aba);
    });
    carregar(aba);
};

document.addEventListener('click', event => {
    const item = event.target.closest('.menu-item') || event.target.closest('[data-aba]');
    if (!item) return;
    event.preventDefault();
    switchTab(item.getAttribute('data-aba') || item.innerText);
});

window.onload = function() {
    ensureRoot();
    switchTab('operacao');
};
`;

const resumo = atualizarTaxonomiaForense();
fs.writeFileSync(appPath, v2AppJs, 'utf8');

console.log('Sistema recalibrado. Menos redundancia, mais clareza tecnica.');
console.log(`Causa raiz forense: ${JSON.stringify(resumo)}`);
