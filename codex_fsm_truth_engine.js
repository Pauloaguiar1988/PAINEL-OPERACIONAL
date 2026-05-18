const fs = require('fs');
const path = require('path');

console.log('EXECUTANDO MOTOR DE VERDADE OPERACIONAL...');

const appPath = path.join(__dirname, 'app.js');
const auditPath = path.join(__dirname, 'data', 'auditoria.json');

function norm(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function verdadeOperacional(dado) {
    const os = String(dado.os_numero || '').toUpperCase();
    const texto = norm([
        dado.observacao,
        dado.texto,
        dado.descricao,
        dado.solucao,
        dado.servico_executado,
        dado.businessRule,
        dado.recommendation,
        dado.classificacao_original,
        dado.classificacao,
        dado.sourceFile,
        dado.cliente
    ].join(' '));

    if (os === 'V69107') {
        return {
            label: 'VINCULADA (SEM VALOR)',
            valor: 0,
            perda: 0,
            status: 'info',
            motivo: 'OS filha Branyl. Faturamento direcionado para V69109.',
            osDestino: 'V69109'
        };
    }

    if (os === 'V69109') {
        return {
            label: 'FATURÁVEL AVULSO',
            valor: 498,
            perda: 0,
            status: 'primary',
            motivo: 'OS destino do faturamento Branyl/V69107.',
            osOrigem: 'V69107'
        };
    }

    if (os === 'V68836') {
        return {
            label: 'PREVENTIVA (CONTRATO)',
            valor: 0,
            perda: 0,
            status: 'success',
            motivo: 'Preventiva coberta por contrato, sem faturamento avulso.'
        };
    }

    if (/faturad[oa]\s+em\s+outra\s+os|faturad[oa]\s+em\s+outra\s+ose|cobrado\s+em\s+outra\s+os|os\s+vinculada/.test(texto)) {
        return {
            label: 'VINCULADA (SEM VALOR)',
            valor: 0,
            perda: 0,
            status: 'info',
            motivo: 'Faturamento direcionado para outra OS.'
        };
    }

    if (/preventiva|manutencao preventiva|visita preventiva/.test(texto) && /contrato|contrato ativo/.test(texto)) {
        return {
            label: 'PREVENTIVA (CONTRATO)',
            valor: 0,
            perda: 0,
            status: 'success',
            motivo: 'Preventiva coberta por contrato/receita recorrente.'
        };
    }

    if (/abrir retorno|necessario retorno|necessario abrir retorno|retorno tecnico|reincidencia/.test(texto) || dado.classificacao === 'Garantia Serviço') {
        return {
            label: 'REINCIDÊNCIA TÉCNICA',
            valor: 0,
            perda: 281,
            status: 'error',
            motivo: 'Retrabalho com deslocamento improdutivo.'
        };
    }

    if (dado.classificacao === 'Garantia Fábrica') {
        return {
            label: 'GARANTIA FÁBRICA',
            valor: 281,
            perda: 0,
            status: 'warning',
            motivo: 'Garantia de fábrica com deslocamento reconhecido.'
        };
    }

    return {
        label: 'FATURÁVEL AVULSO',
        valor: 498,
        perda: 0,
        status: 'primary',
        motivo: 'Atendimento faturável avulso.'
    };
}

function recalibrarVerdade() {
    if (!fs.existsSync(auditPath)) {
        throw new Error('data/auditoria.json nao encontrado.');
    }

    const dados = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const atualizados = dados.map(item => {
        const verdade = verdadeOperacional(item);
        return {
            ...item,
            truthLabel: verdade.label,
            truthStatus: verdade.status,
            truthValue: verdade.valor,
            truthLoss: verdade.perda,
            truthReason: verdade.motivo,
            linkedBillingOS: verdade.osDestino || null,
            linkedSourceOS: verdade.osOrigem || null,
            classificacao: verdade.label,
            valorEstimado: verdade.valor,
            perdaEstimativa: verdade.perda,
            isRecurrent: verdade.label === 'REINCIDÊNCIA TÉCNICA',
            businessRule: verdade.motivo
        };
    });

    fs.writeFileSync(auditPath, JSON.stringify(atualizados, null, 2), 'utf8');

    return atualizados.reduce((acc, item) => {
        acc[item.truthLabel] = (acc[item.truthLabel] || 0) + 1;
        return acc;
    }, {});
}

const truthAppJs = `
function injectTruthStyle() {
    if (document.getElementById('fsm-truth-style')) return;
    const style = document.createElement('style');
    style.id = 'fsm-truth-style';
    style.innerHTML = \`
        body { overflow-x:hidden; background:#020617; }
        .sidebar { position:fixed; left:0; top:0; width:260px; height:100vh; z-index:100; background:#0f172a; overflow-y:auto; }
        .main-content, #fsm-layout-root { margin-left:260px; width:calc(100% - 260px); min-height:100vh; padding:20px; box-sizing:border-box; color:#e5e7eb; }
        #fsm-view-host { max-width:1440px; margin:0 auto; }
        .card-fsm { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:16px; margin-bottom:12px; }
        .tag { display:inline-block; border:1px solid #334155; background:#0f172a; border-radius:999px; padding:3px 8px; font-size:12px; }
        .tag.info { border-color:#60a5fa; color:#93c5fd; }
        .tag.success { border-color:#10b981; color:#86efac; }
        .tag.error { border-color:#ef4444; color:#fca5a5; }
        .tag.primary { border-color:#10b981; color:#bbf7d0; }
        .tag.warning { border-color:#f59e0b; color:#fde68a; }
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
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function slug(valor) {
    return String(valor || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ensureRoot() {
    injectTruthStyle();
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

function calcularStats(dados) {
    return {
        faturamento: dados.reduce((a, b) => a + Number(b.truthValue ?? b.valorEstimado ?? 0), 0),
        perda: dados.reduce((a, b) => a + Number(b.truthLoss ?? b.perdaEstimativa ?? 0), 0),
        vinculadas: dados.filter(d => d.truthLabel === 'VINCULADA (SEM VALOR)').length,
        contratos: dados.filter(d => d.truthLabel === 'PREVENTIVA (CONTRATO)').length,
        reincidencias: dados.filter(d => d.truthLabel === 'REINCIDÊNCIA TÉCNICA').length,
        faturaveis: dados.filter(d => d.truthLabel === 'FATURÁVEL AVULSO').length,
        total: dados.length
    };
}

function atualizarTopo(dados) {
    const s = calcularStats(dados);
    const ids = {
        gmOsRiscoEstimado: moeda(s.faturamento),
        gmOsTotal: s.total,
        gmOsFaturamento: s.faturaveis,
        gmOsAlertRecords: s.reincidencias + s.vinculadas + s.contratos
    };
    Object.entries(ids).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });
    document.querySelectorAll('.valor-faturamento').forEach(el => el.innerText = moeda(s.faturamento));
    document.querySelectorAll('.valor-perda').forEach(el => el.innerText = moeda(s.perda));
}

function renderDashboardVerdade(dados) {
    const host = ensureRoot();
    const s = calcularStats(dados);
    const grupos = dados.reduce((acc, d) => {
        const k = d.truthLabel || d.classificacao || 'Sem regra';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    host.innerHTML = \`
        <section>
            <h2>Motor de Verdade Operacional</h2>
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px;">
                <div class="card-fsm"><span class="fsm-muted">Faturamento Real</span><h3>\${moeda(s.faturamento)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Perda Real</span><h3 style="color:#ef4444">\${moeda(s.perda)}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Vinculadas</span><h3>\${s.vinculadas}</h3></div>
                <div class="card-fsm"><span class="fsm-muted">Preventivas</span><h3>\${s.contratos}</h3></div>
            </div>
            <div class="card-fsm">
                <h3>Classificação pela Regra de Negócio</h3>
                \${Object.entries(grupos).map(([k, v]) => '<div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:8px 0;"><span>' + k + '</span><b>' + v + ' OS</b></div>').join('')}
            </div>
        </section>
    \`;
}

function renderOperacao(dados, filtro) {
    const host = ensureRoot();
    const filtrados = dados.filter(d => {
        const label = d.truthLabel || d.classificacao;
        if (filtro === 'critical') return d.riskLevel === 'critical';
        if (filtro && filtro !== 'all') return label === filtro;
        return true;
    });
    host.innerHTML = \`
        <section>
            <h2>Operação</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button onclick="filtrar('all')" class="btn-fsm">Todas</button>
                <button onclick="filtrar('critical')" class="btn-fsm">Críticas</button>
                <button onclick="filtrar('REINCIDÊNCIA TÉCNICA')" class="btn-fsm">Reincidências</button>
                <button onclick="filtrar('FATURÁVEL AVULSO')" class="btn-fsm">Faturáveis</button>
                <button onclick="filtrar('PREVENTIVA (CONTRATO)')" class="btn-fsm">Preventivas</button>
                <button onclick="filtrar('VINCULADA (SEM VALOR)')" class="btn-fsm">Vinculadas</button>
            </div>
            <table class="fsm-table">
                <thead><tr><th>O.S.</th><th>Cliente</th><th>Regra</th><th>Valor</th><th>Motivo</th></tr></thead>
                <tbody>
                    \${filtrados.slice(0, 100).map(d => \`
                        <tr>
                            <td><b>\${d.os_numero || 'S/N'}</b></td>
                            <td>\${String(d.cliente || 'Cliente').substring(0, 36)}</td>
                            <td><span class="tag \${d.truthStatus || 'primary'}">\${d.truthLabel || d.classificacao || 'N/A'}</span></td>
                            <td style="color:\${Number(d.truthValue ?? d.valorEstimado ?? 0) > 0 ? '#10b981' : '#94a3b8'}">\${moeda(d.truthValue ?? d.valorEstimado)}</td>
                            <td><span class="fsm-muted">\${d.truthReason || d.businessRule || '-'}</span></td>
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
        techs[t].faturamento += Number(d.truthValue ?? d.valorEstimado ?? 0);
        if (d.truthLabel !== 'REINCIDÊNCIA TÉCNICA') techs[t].resolvidoPrimeira++;
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
        clients[c].faturamento += Number(d.truthValue ?? d.valorEstimado ?? 0);
        clients[c].perda += Number(d.truthLoss ?? d.perdaEstimativa ?? 0);
    });
    host.innerHTML = '<section><h2>Clientes</h2><p class="fsm-muted">Mostra onde há perda operacional real, já removendo OS vinculada e preventiva.</p>' +
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
        return renderDashboardVerdade(dados);
    } catch (e) {
        console.error('Erro ao renderizar aba:', e);
        ensureRoot().innerHTML = '<div class="card-fsm">Erro ao carregar dados: ' + e.message + '</div>';
    }
}

window.filtrar = function(filtro) { carregar('operacao', filtro); };

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

const resumo = recalibrarVerdade();
fs.writeFileSync(appPath, truthAppJs, 'utf8');

console.log('app.js recalibrado com as regras de Vinculada e Preventiva.');
console.log(`Resumo Truth Engine: ${JSON.stringify(resumo)}`);
