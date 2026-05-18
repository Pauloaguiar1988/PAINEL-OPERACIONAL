(function () {
  function getToken() {
    try {
      if (typeof window.getPanelAuthToken === 'function') return window.getPanelAuthToken() || '';
      return localStorage.getItem('ccoi_auth_token_v2')
        || sessionStorage.getItem('ccoi_auth_token_v2')
        || localStorage.getItem('ccoi_auth_token_v1')
        || sessionStorage.getItem('ccoi_auth_token_v1')
        || '';
    } catch (_) {
      return '';
    }
  }

  function withAuth(url) {
    const token = getToken();
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }

  function getLocalISODate(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getLanguageTag() {
    try {
      if (typeof window.getPanelUILanguage === 'function') {
        return window.getPanelUILanguage() || 'pt-BR';
      }
    } catch (_) {}
    const htmlLang = String(document.documentElement?.lang || '').toLowerCase();
    return htmlLang.startsWith('en') ? 'en-US' : 'pt-BR';
  }

  function activeDate() {
    const current = document.getElementById('currentDateInput')?.value || '';
    const opDate = document.getElementById('op_data')?.value || '';
    return (current || opDate || getLocalISODate(new Date())).trim();
  }

  function applyActiveDate(dateLike) {
    const nextDate = String(dateLike || '').trim();
    if (!nextDate) return;
    ['currentDateInput', 'floatingDateInput', 'op_data', 'ag_data_base'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = nextDate;
    });
  }

  function isAuthLocked() {
    const overlay = document.getElementById('authOverlay');
    if (overlay && overlay.classList.contains('visible')) return true;
    return document.body.classList.contains('auth-locked');
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value == null || value === '' ? '--' : String(value);
  }

  function formatDate(iso) {
    if (!iso || !iso.includes('-')) return '--';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function formatDateTimeLocal(valueLike, locale) {
    if (!valueLike) return '--';
    const parsed = new Date(valueLike);
    if (Number.isNaN(parsed.getTime())) return '--';
    const tag = locale === 'en-US' ? 'en-US' : 'pt-BR';
    try {
      return new Intl.DateTimeFormat(tag, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(parsed);
    } catch (_) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      return `${d}/${m}/${y} ${hh}:${mm}`;
    }
  }

  function formatMoney(value) {
    const n = Number(value || 0);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setExternalLink(id, url, labelWhenMissing) {
    const el = document.getElementById(id);
    if (!el) return;
    const safeUrl = String(url || '').trim();
    if (!safeUrl) {
      el.href = '#';
      el.textContent = labelWhenMissing || 'Nao configurado';
      return;
    }
    el.href = safeUrl;
    el.textContent = 'Abrir';
  }

  function levelClass(level) {
    const v = String(level || '').toLowerCase();
    if (v === 'critico' || v === 'critical') return 'gm-level-critico';
    if (v === 'pressao' || v === 'pressure') return 'gm-level-pressao';
    if (v === 'atencao' || v === 'attention') return 'gm-level-atencao';
    return 'gm-level-estavel';
  }

  function renderLevel(level) {
    const el = document.getElementById('gmLevel');
    if (!el) return;
    el.textContent = level || 'Estavel';
    el.classList.remove('gm-level-estavel', 'gm-level-atencao', 'gm-level-pressao', 'gm-level-critico');
    el.classList.add(levelClass(level));
  }

  function renderClientList(items) {
    const box = document.getElementById('gmClientList');
    if (!box) return;
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      box.innerHTML = '<div class="system-line"><strong>Sem cliente critico registrado</strong><span>Atualize em Operacao</span></div>';
      return;
    }
    box.innerHTML = list.slice(0, 5).map(item => {
      const due = item.due ? formatDate(item.due) : 'Sem prazo';
      const action = item.action ? item.action : 'Acao nao registrada';
      return `<div class="system-line"><strong>${item.name || 'Cliente'}</strong><span>${item.priority || 'Alta'} • ${due} • ${action}</span></div>`;
    }).join('');
  }

  function renderActionList(items) {
    const box = document.getElementById('gmActionList');
    if (!box) return;
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      box.innerHTML = '<div class="system-line"><strong>Sem acao sugerida</strong><span>Preencha os dados do dia</span></div>';
      return;
    }
    box.innerHTML = list.slice(0, 5).map((item, idx) => {
      return `<div class="system-line"><strong>${idx + 1}. Acao</strong><span>${item}</span></div>`;
    }).join('');
  }

  function renderOsAudit(osAudit, operacaoMix, pricing) {
    const audit = osAudit || {};
    const opMix = operacaoMix || {};
    lastOsAuditPayload = audit;
    setText('gmOsTotal', audit.total || 0);
    setText('gmOsAlertRecords', audit.recordsWithAlert || 0);
    setText('gmOsFaturamento', audit.faturamento || 0);
    setText('gmOsCodigo', audit.codigo || 0);
    setText('gmOsLaudo', audit.laudo || 0);
    setText('gmOsRiscoEstimado', formatMoney(audit.riscoEstimado || 0));
    setText('gmOpsMix', `${opMix.interna || 0} / ${opMix.externa || 0}`);

    const lookerLink = document.getElementById('gmLookerLink');
    if (lookerLink) {
      const url = pricing?.lookerUrl || '#';
      lookerLink.href = url;
      lookerLink.textContent = url && url !== '#' ? 'Abrir referencia' : 'Nao configurado';
    }
    setExternalLink('gmPortalLink', pricing?.portalClienteUrl, 'Portal nao configurado');
    setExternalLink('gmPowerBiLink', pricing?.powerBiUrl, 'BI nao configurado');
    setText('gmPowerBiAccessUser', pricing?.powerBiAccessEmail || 'Nao vinculada');

    const box = document.getElementById('gmOsAuditList');
    if (!box) return;
    const items = Array.isArray(audit.items) ? audit.items.filter(item => Array.isArray(item.issues) && item.issues.length) : [];
    if (!items.length) {
      box.innerHTML = '<div class="system-line"><strong>Sem pendencias de O.S.</strong><span>Importe as ordens para analisar faturamento, codigo e laudo.</span></div>';
      return;
    }
    box.innerHTML = items.slice(0, 6).map(item => {
      const os = item.os || 'OS sem codigo';
      const cliente = item.cliente || 'Cliente nao informado';
      const problemas = item.issues.map(issue => issue.message).join(' | ');
      const proximo = item.nextStep || 'Revisar O.S.';
      return `<div class="system-line"><strong>${os} - ${cliente}</strong><span>${problemas}<br>Proximo passo: ${proximo}</span></div>`;
    }).join('');
  }

  function normalizeAiResultForPanel(resultLike) {
    const result = (resultLike && typeof resultLike === 'object') ? resultLike : {};
    const aiAnalysis = (result.aiAnalysis && typeof result.aiAnalysis === 'object') ? result.aiAnalysis : {};
    const contractClass = (aiAnalysis.classificacao && typeof aiAnalysis.classificacao === 'object') ? aiAnalysis.classificacao : {};
    const contractDecision = (aiAnalysis.decisao && typeof aiAnalysis.decisao === 'object') ? aiAnalysis.decisao : {};
    const contractEscalation = (aiAnalysis.escalonamento && typeof aiAnalysis.escalonamento === 'object') ? aiAnalysis.escalonamento : {};
    const contractConfidence = (aiAnalysis.confidence && typeof aiAnalysis.confidence === 'object') ? aiAnalysis.confidence : {};
    const contractReview = (aiAnalysis.review && typeof aiAnalysis.review === 'object') ? aiAnalysis.review : {};
    const contractLaudo = (aiAnalysis.laudo && typeof aiAnalysis.laudo === 'object') ? aiAnalysis.laudo : {};
    const estrutura = (result.estruturaLaudoSugerida && typeof result.estruturaLaudoSugerida === 'object') ? result.estruturaLaudoSugerida : {};
    return {
      resumo: String(result.resumo || '').trim(),
      risco: String(result.risco || '').trim(),
      classificacao: String(result.classificacao || '').trim(),
      statusAnalise: String(aiAnalysis.status || '').trim(),
      confianca: String(contractConfidence.geral || '').trim(),
      motivoConfianca: String(contractConfidence.motivo || '').trim(),
      tipoLaudoSugerido: String(result.tipoLaudoSugerido || contractClass.tipoLaudo || '').trim(),
      tipoAtendimento: String(result.tipoAtendimento || contractClass.tipoAtendimento || '').trim(),
      decisaoOperacional: String(result.decisaoOperacional || contractDecision.operacional || '').trim(),
      decisaoCobranca: String(result.decisaoCobranca || contractDecision.cobranca || '').trim(),
      recomendacoes: Array.isArray(result.recomendacoes)
        ? result.recomendacoes.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      evidenciasNecessarias: Array.isArray(result.evidenciasNecessarias)
        ? result.evidenciasNecessarias.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      proximaAcao: String(result.proximaAcao || '').trim(),
      necessitaEscalonamento: result.necessitaEscalonamento === true || contractEscalation.necessario === true,
      nivelEscalonamento: String(result.nivelEscalonamento || contractEscalation.nivel || 'nenhum').trim(),
      reviewRequired: contractReview.required === true,
      reviewReason: String(contractReview.reason || '').trim(),
      estruturaLaudoSugerida: {
        objetivo: String(estrutura.objetivo || contractLaudo.objetivo || '').trim(),
        diagnostico: String(estrutura.diagnostico || contractLaudo.cenarioEncontradoDiagnostico || '').trim(),
        acoes: Array.isArray(estrutura.acoes) ? estrutura.acoes.map(item => String(item || '').trim()).filter(Boolean) : (Array.isArray(contractLaudo.acoesRealizadas) ? contractLaudo.acoesRealizadas : []),
        resultado: String(estrutura.resultado || contractLaudo.resultadoStatusFinal || '').trim(),
        pendencias: Array.isArray(estrutura.pendencias) ? estrutura.pendencias.map(item => String(item || '').trim()).filter(Boolean) : (Array.isArray(contractLaudo.pendenciasResponsaveis) ? contractLaudo.pendenciasResponsaveis : []),
        conclusao: String(estrutura.conclusao || contractLaudo.conclusaoTecnica || '').trim()
      }
    };
  }

  function setAiOsState(state, payload) {
    const resultBox = document.getElementById('gmAiOsResult');
    const btn = document.getElementById('gmAiAnalyzeOsBtn');
    if (!resultBox) return;
    resultBox.classList.remove('is-error', 'is-loading');
    if (btn) {
      btn.disabled = state === 'loading';
      btn.classList.toggle('is-loading', state === 'loading');
    }
    if (state === 'loading') {
      resultBox.classList.add('is-loading');
      resultBox.innerHTML = '<span class="gm-ai-status gm-ai-status-pending">IA: pendente</span>';
      return;
    }
    if (state === 'auth') {
      resultBox.classList.add('is-error');
      resultBox.innerHTML = '<span class="gm-ai-status gm-ai-status-error">IA: erro de autenticacao</span>';
      return;
    }
    if (state === 'error') {
      resultBox.classList.add('is-error');
      resultBox.innerHTML = `<span class="gm-ai-status gm-ai-status-error">IA: erro</span><small>${escapeHtml(payload || 'Nao foi possivel atualizar a analise.')}</small>`;
      return;
    }
    if (state === 'status') {
      const status = String(payload?.status || 'pending').trim().toLowerCase();
      const label = status === 'updated' ? 'Atualizado' : (status === 'error' ? 'Erro' : 'Pendente');
      const cls = status === 'updated' ? 'updated' : (status === 'error' ? 'error' : 'pending');
      const detail = String(payload?.detail || '').trim();
      resultBox.innerHTML = `<span class="gm-ai-status gm-ai-status-${cls}">IA: ${escapeHtml(label)}</span>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}`;
      return;
    }
    if (state === 'success') {
      const result = normalizeAiResultForPanel(payload?.result);
      const recommendations = result.recomendacoes.length
        ? `<ul class="gm-ai-os-list">${result.recomendacoes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<span>--</span>';
      const evidences = result.evidenciasNecessarias.length
        ? `<ul class="gm-ai-os-list">${result.evidenciasNecessarias.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<span>--</span>';
      const laudo = result.estruturaLaudoSugerida;
      const laudoActions = laudo.acoes.length
        ? `<ul class="gm-ai-os-list">${laudo.acoes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<span>--</span>';
      const laudoPendencies = laudo.pendencias.length
        ? `<ul class="gm-ai-os-list">${laudo.pendencias.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<span>--</span>';
      resultBox.innerHTML = `
        <div class="gm-ai-os-card">
          <div class="gm-ai-os-line"><strong>Resumo</strong><span>${escapeHtml(result.resumo || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Status IA</strong><span>${escapeHtml(result.statusAnalise || 'processed')} | Confianca: ${escapeHtml(result.confianca || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Risco</strong><span>${escapeHtml(result.risco || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Classificacao</strong><span>${escapeHtml(result.classificacao || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Tipo de atendimento</strong><span>${escapeHtml(result.tipoAtendimento || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Tipo de laudo sugerido</strong><span>${escapeHtml(result.tipoLaudoSugerido || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Decisao operacional</strong><span>${escapeHtml(result.decisaoOperacional || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Decisao de cobranca</strong><span>${escapeHtml(result.decisaoCobranca || '--')}</span></div>
          <div class="gm-ai-os-line"><strong>Escalonamento</strong><span>${result.necessitaEscalonamento ? 'Sim' : 'Nao'} | ${escapeHtml(result.nivelEscalonamento || 'nenhum')}</span></div>
          <div class="gm-ai-os-line"><strong>Revisao humana</strong><span>${result.reviewRequired ? 'Sim' : 'Nao'}${result.reviewReason ? ` | ${escapeHtml(result.reviewReason)}` : ''}</span></div>
          <div class="gm-ai-os-line"><strong>Recomendacoes</strong>${recommendations}</div>
          <div class="gm-ai-os-line"><strong>Evidencias necessarias</strong>${evidences}</div>
          <div class="gm-ai-os-line"><strong>Proxima acao</strong><span>${escapeHtml(result.proximaAcao || '--')}</span></div>
          <details class="gm-ai-os-details">
            <summary>Estrutura de laudo sugerida</summary>
            <div class="gm-ai-os-line"><strong>Objetivo</strong><span>${escapeHtml(laudo.objetivo || '--')}</span></div>
            <div class="gm-ai-os-line"><strong>Diagnostico</strong><span>${escapeHtml(laudo.diagnostico || '--')}</span></div>
            <div class="gm-ai-os-line"><strong>Acoes</strong>${laudoActions}</div>
            <div class="gm-ai-os-line"><strong>Resultado</strong><span>${escapeHtml(laudo.resultado || '--')}</span></div>
            <div class="gm-ai-os-line"><strong>Pendencias</strong>${laudoPendencies}</div>
            <div class="gm-ai-os-line"><strong>Conclusao</strong><span>${escapeHtml(laudo.conclusao || '--')}</span></div>
          </details>
        </div>`;
      return;
    }
    resultBox.innerHTML = '<span class="gm-ai-status gm-ai-status-pending">IA: pendente</span>';
  }

  function buildAiOsContext() {
    const payload = lastInsightsPayload || {};
    const insights = payload.insights || {};
    const audit = lastOsAuditPayload || insights.osAudit || {};
    const items = Array.isArray(audit.items) ? audit.items : [];
    const item = items.find(row => Array.isArray(row?.issues) && row.issues.length) || items[0] || {};
    const issues = Array.isArray(item.issues) ? item.issues.map(issue => issue?.message || issue).filter(Boolean) : [];
    return {
      data: payload.date || insights.date || activeDate(),
      cliente: item.cliente || item.client || '',
      os: item.os || item.codigoOS || item.ordemServico || '',
      equipamento: item.equipamento || item.equipment || '',
      problema: issues.join(' | ') || item.nextStep || insights.topAlert || '',
      classificacaoAtual: item.classificacao || '',
      proximaAcaoAtual: item.nextStep || '',
      totais: {
        osAnalisadas: audit.total || 0,
        registrosComAlerta: audit.recordsWithAlert || 0,
        riscoNaoFaturar: audit.faturamento || 0,
        laudoSemClareza: audit.laudo || 0
      }
    };
  }

  async function analyzeCurrentOsWithAi(optionsLike) {
    const options = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
    const token = getToken();
    if (!token) {
      setAiOsState('auth');
      return;
    }
    setAiOsState('loading');
    const headers = {
      'Content-Type': 'application/json',
      'x-auth-token': token,
      'x-panel-lang': getLanguageTag()
    };
    try {
      const response = await fetch(withAuth('/api/ai/analisar-os'), {
        method: 'POST',
        headers,
        body: JSON.stringify(buildAiOsContext())
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        setAiOsState('auth');
        return;
      }
      if (!response.ok || payload?.success !== true) {
        setAiOsState('error', payload?.error || 'Nao foi possivel analisar a OS agora.');
        return;
      }
      if (options.statusOnly === true) {
        setAiOsState('status', { status: 'updated', detail: `Contrato ${payload?.result?.aiAnalysis?.version || payload?.promptName || 'mock'}` });
      } else {
        setAiOsState('success', payload);
      }
    } catch (_) {
      setAiOsState('error', 'Falha de comunicacao ao consultar a IA.');
    }
  }

  function bindAiOsPanel() {
    const title = document.querySelector('#gmAiOsPanel .gm-ai-os-head strong');
    if (title) title.textContent = 'Status da IA Operacional';
    setAiOsState('status', { status: 'pending', detail: 'Aguardando base de OS.' });
    const btn = document.getElementById('gmAiAnalyzeOsBtn');
    if (!btn || btn.dataset.gmBound === '1') return;
    btn.dataset.gmBound = '1';
    btn.addEventListener('click', () => {
      analyzeCurrentOsWithAi().catch(() => {
        setAiOsState('error', 'Nao foi possivel analisar a OS agora.');
      });
    });
  }

  function updateAutomaticAiStatus(payload) {
    const insights = payload?.insights || {};
    const audit = lastOsAuditPayload || insights.osAudit || {};
    const total = Number(audit.total || 0);
    const dateKey = String(payload?.date || insights.date || activeDate() || '').trim();
    const title = document.querySelector('#gmAiOsPanel .gm-ai-os-head strong');
    if (title) title.textContent = 'Status da IA Operacional';
    if (!dateKey || total <= 0) {
      lastAiAutoAnalysisKey = '';
      setAiOsState('status', { status: 'pending', detail: 'Aguardando base de OS.' });
      return;
    }
    const signature = `${dateKey}|${total}|${audit.recordsWithAlert || 0}|${audit.faturamento || 0}|${audit.laudo || 0}`;
    if (signature === lastAiAutoAnalysisKey) {
      setAiOsState('status', { status: 'updated', detail: 'Analise automatica sincronizada.' });
      return;
    }
    lastAiAutoAnalysisKey = signature;
    setAiOsState('status', { status: 'pending', detail: 'Atualizando leitura automatica...' });
    analyzeCurrentOsWithAi({ statusOnly: true }).catch(() => {
      setAiOsState('status', { status: 'error', detail: 'Falha ao atualizar a leitura automatica.' });
    });
  }

  function cockpitFriendlyServiceType(key, locale) {
    const k = String(key || '').trim().toLowerCase();
    const isEn = locale === 'en-US';
    const map = {
      corretiva: isEn ? 'Corrective' : 'Corretiva',
      preventiva: isEn ? 'Preventive' : 'Preventiva',
      instalacao: isEn ? 'Installation (REP)' : 'Instalação REP',
      configuracao: isEn ? 'Installation (Access)' : 'Instalação Acesso',
      suporte_ajuste: isEn ? 'Software' : 'Software',
      treinamento: isEn ? 'Training' : 'Treinamento',
      vistoria: isEn ? 'Inspection / guidance' : 'Vistoria/Orientação',
      retorno_tecnico: isEn ? 'Rework / return' : 'Retorno técnico',
      nao_identificado: isEn ? 'Other' : 'Outros'
    };
    return map[k] || (isEn ? 'Other' : 'Outros');
  }

  function cockpitFriendlyWarrantyType(key, locale) {
    const k = String(key || '').trim().toLowerCase();
    const isEn = locale === 'en-US';
    const map = {
      sem_garantia: isEn ? 'No warranty' : 'Sem garantia',
      garantia_fabrica: isEn ? 'Factory warranty' : 'Garantia de fábrica',
      garantia_peca: isEn ? 'Part warranty' : 'Garantia de peça',
      garantia_servico_instalacao: isEn ? 'Service/installation warranty' : 'Garantia de serviço/instalação',
      nao_identificado: isEn ? 'Not identified' : 'Não identificado'
    };
    return map[k] || (isEn ? 'Other' : 'Outros');
  }

  function buildTop4PlusOthers(distLike) {
    const dist = Array.isArray(distLike) ? distLike : [];
    const sorted = dist
      .map((item) => ({
        key: String(item?.key || '').trim(),
        count: Number(item?.count || 0),
        ratePct: Number(item?.ratePct || 0)
      }))
      .filter((item) => item.key && item.count > 0)
      .sort((a, b) => b.count - a.count || b.ratePct - a.ratePct || a.key.localeCompare(b.key));
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4);
    if (!rest.length) return top;
    const other = rest.reduce((acc, item) => {
      acc.count += item.count;
      acc.ratePct += item.ratePct;
      return acc;
    }, { key: 'outros', count: 0, ratePct: 0 });
    return [...top, other];
  }

  function buildCockpitFixedDistribution(distLike, specs) {
    const rows = Array.isArray(distLike) ? distLike : [];
    const used = new Set();
    const total = rows.reduce((acc, item) => acc + Math.max(0, Number(item?.count || 0)), 0);
    const normalizedRows = rows.map((item) => ({
      key: String(item?.key || '').trim().toLowerCase(),
      count: Math.max(0, Number(item?.count || 0))
    })).filter((item) => item.key && item.count > 0);
    const result = specs.map((spec) => {
      const keys = Array.isArray(spec.keys) ? spec.keys.map((key) => String(key || '').trim().toLowerCase()) : [];
      const count = normalizedRows.reduce((acc, item) => {
        if (!keys.includes(item.key)) return acc;
        used.add(item.key);
        return acc + item.count;
      }, 0);
      return {
        label: spec.label,
        count,
        ratePct: total > 0 ? (count / total) * 100 : 0
      };
    });
    const otherCount = normalizedRows
      .filter((item) => !used.has(item.key))
      .reduce((acc, item) => acc + item.count, 0);
    const other = result.find((item) => String(item.label || '').toLowerCase().includes('outro') || String(item.label || '').toLowerCase().includes('other'));
    if (other) {
      other.count += otherCount;
      other.ratePct = total > 0 ? (other.count / total) * 100 : 0;
    }
    return result;
  }

  function renderCockpitBars(targetId, itemsLike, locale) {
    const host = document.getElementById(targetId);
    if (!host) return;
    const items = (Array.isArray(itemsLike) ? itemsLike : []).filter((item) => Number(item?.count || 0) > 0);
    if (!items.length) {
      host.innerHTML = `<div class="gm-cockpit-empty">${escapeHtml(locale === 'en-US' ? 'No operational baseline for this view.' : 'Não há base operacional para esta leitura.')}</div>`;
      return;
    }
    const maxPct = Math.max(1, ...items.map((item) => Number(item.ratePct || 0)));
    host.innerHTML = items.map((item) => {
      const label = escapeHtml(String(item.label || '--'));
      const count = Math.max(0, Number(item.count || 0));
      const pctVal = Math.max(0, Number(item.ratePct || 0));
      const pctLabel = `${pctVal.toLocaleString(locale === 'en-US' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%`;
      const fillPct = Math.max(2, Math.min(100, Math.round((pctVal / maxPct) * 100)));
      return (
        `<div class="gm-cockpit-mini-bar">`
        + `<div class="lbl">${label}</div>`
        + `<div class="val">${escapeHtml(String(count))} | ${escapeHtml(pctLabel)}</div>`
        + `<div class="track"><span class="fill" style="width:${fillPct}%"></span></div>`
        + `</div>`
      );
    }).join('');
  }

  function renderCockpitTopEquipment(targetId, topEquipmentLike, locale) {
    const host = document.getElementById(targetId);
    if (!host) return;
    const top = (topEquipmentLike && typeof topEquipmentLike === 'object') ? topEquipmentLike : {};
    const name = String(top.equipment || '').trim();
    const totalOs = Math.max(0, Number(top.totalOs || 0));
    const sharePct = Math.max(0, Number(top.sharePct || 0));
    const cause = String(top?.topCause?.label || top?.topCause || '').trim();
    if (!name && !totalOs) {
      host.innerHTML = `<span>${escapeHtml(locale === 'en-US' ? 'No equipment baseline for this view.' : 'Não há equipamento incidente nesta leitura.')}</span>`;
      return;
    }
    const pctLabel = `${sharePct.toLocaleString(locale === 'en-US' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%`;
    const occLabel = locale === 'en-US' ? 'occurrences' : 'ocorrências';
    const periodLabel = locale === 'en-US' ? 'of period' : 'do período';
    const causeLabel = locale === 'en-US' ? 'Dominant cause' : 'Causa dominante';
    host.innerHTML =
      `<strong>${escapeHtml(name || (locale === 'en-US' ? 'Equipment not identified' : 'Equipamento não identificado'))}</strong>`
      + `<span>${escapeHtml(String(totalOs))} ${occLabel} | ${escapeHtml(pctLabel)} ${periodLabel}</span>`
      + (cause ? `<span>${escapeHtml(causeLabel)}: ${escapeHtml(cause)}</span>` : '');
  }

  function renderCockpitOperationalRead(payload, locale) {
    const monthly = (payload?.monthlyOs && typeof payload.monthlyOs === 'object') ? payload.monthlyOs : {};
    const hasDailyBase = payload?.exists === true;
    const hasMonthlyBase = Number(monthly?.sampleDays || 0) > 0;
    const scopeHint = document.getElementById('gmCockpitScopeHint');
    if (scopeHint) {
      scopeHint.textContent = hasDailyBase
        ? (locale === 'en-US' ? 'Daily reading' : 'Leitura do dia')
        : (hasMonthlyBase ? (locale === 'en-US' ? 'Monthly reading used as reference' : 'Leitura mensal usada como referência') : (locale === 'en-US' ? 'No baseline' : 'Sem base operacional'));
    }
    if (!hasDailyBase && !hasMonthlyBase) {
      renderCockpitBars('gmMixAtendimento', [], locale);
      renderCockpitBars('gmMixCobertura', [], locale);
      renderCockpitTopEquipment('gmProdutoTop', null, locale);
      return;
    }
    const em = (monthly?.executiveMonthly && typeof monthly.executiveMonthly === 'object') ? monthly.executiveMonthly : {};
    const rankings = (em?.rankings && typeof em.rankings === 'object') ? em.rankings : {};
    const detailed = (monthly?.detailedAnalytics && typeof monthly.detailedAnalytics === 'object') ? monthly.detailedAnalytics : {};
    const taxonomySummary = (detailed?.taxonomySummary && typeof detailed.taxonomySummary === 'object') ? detailed.taxonomySummary : {};

    const serviceRaw = Array.isArray(rankings.serviceType) && rankings.serviceType.length
      ? rankings.serviceType
      : (Array.isArray(taxonomySummary.serviceType) ? taxonomySummary.serviceType : []);
    const warrantyRaw = Array.isArray(rankings.warrantyType) && rankings.warrantyType.length
      ? rankings.warrantyType
      : (Array.isArray(taxonomySummary.warrantyType) ? taxonomySummary.warrantyType : []);

    const isEn = locale === 'en-US';
    const serviceDist = buildCockpitFixedDistribution(serviceRaw, [
      { label: isEn ? 'Corrective' : 'Corretiva', keys: ['corretiva', 'corretivo'] },
      { label: isEn ? 'Preventive' : 'Preventiva', keys: ['preventiva', 'preventivo'] },
      { label: isEn ? 'REP installation' : 'Instalacao REP', keys: ['instalacao', 'instalacao_rep', 'rep'] },
      { label: isEn ? 'Access installation' : 'Instalacao Acesso', keys: ['configuracao', 'instalacao_acesso', 'acesso'] },
      { label: 'Software', keys: ['software', 'suporte_ajuste', 'atualizacao'] },
      { label: isEn ? 'Other' : 'Outros', keys: ['nao_identificado', 'outros', 'outro'] }
    ]);
    const warrantyDist = buildCockpitFixedDistribution(warrantyRaw, [
      { label: isEn ? 'No warranty' : 'Sem garantia', keys: ['sem_garantia', 'fora_garantia'] },
      { label: isEn ? 'Factory warranty' : 'Garantia fabrica', keys: ['garantia_fabrica'] },
      { label: isEn ? 'Service warranty' : 'Garantia servico', keys: ['garantia_servico', 'garantia_servico_instalacao'] },
      { label: isEn ? 'Part warranty' : 'Garantia peca', keys: ['garantia_peca'] },
      { label: isEn ? 'Not identified' : 'Nao identificado', keys: ['nao_identificado', 'indefinido'] }
    ]);

    renderCockpitBars('gmMixAtendimento', serviceDist.map((item) => ({
      label: item.label || cockpitFriendlyServiceType(item.key, locale),
      count: item.count,
      ratePct: item.ratePct
    })), locale);

    renderCockpitBars('gmMixCobertura', warrantyDist.map((item) => ({
      label: item.label || cockpitFriendlyWarrantyType(item.key, locale),
      count: item.count,
      ratePct: item.ratePct
    })), locale);

    const topEquipmentFromRankings = Array.isArray(rankings.topEquipment) ? rankings.topEquipment[0] : null;
    const topEquipmentFromDetailed = Array.isArray(detailed?.taxonomyByEquipment) ? detailed.taxonomyByEquipment[0] : null;
    const eqRow = topEquipmentFromRankings || (topEquipmentFromDetailed && typeof topEquipmentFromDetailed === 'object'
      ? {
          equipment: String(topEquipmentFromDetailed.equipment || '').trim(),
          totalOs: Number(topEquipmentFromDetailed.totalOs || 0),
          sharePct: Number(topEquipmentFromDetailed.sharePct || 0),
          topCause: (() => {
            const topCause = Array.isArray(topEquipmentFromDetailed.probableCause) ? topEquipmentFromDetailed.probableCause[0] : null;
            const key = String(topCause?.key || '').trim() || 'indefinido';
            return { label: taxonomyValueLabel('probableCause', key, locale) };
          })()
        }
      : null);

    renderCockpitTopEquipment('gmProdutoTop', eqRow, locale);
  }

  let activeAnalyticsTab = 'interna';
  const ANALYTICS_TAB_PANEL_MAP = Object.freeze({
    interna: 'gmTabPanelInterna',
    externa: 'gmTabPanelExterna',
    trimestral: 'gmTabPanelTrimestral'
  });
  const QUARTERLY_CACHE_TTL_MS = 75 * 1000;
  const quarterlyUiState = {
    selectedQuarter: '',
    activeQuarter: '',
    locale: 'pt-BR',
    cache: new Map(),
    requestNonce: 0,
    manualSelection: false
  };
  const REVIEW_ACTIONS_BY_STATUS = Object.freeze({
    novo: ['aceite', 'ajuste', 'revisao', 'encerramento', 'descarte'],
    em_revisao: ['aceite', 'ajuste', 'encerramento', 'descarte'],
    ajustado: ['revisao', 'aceite', 'encerramento', 'descarte'],
    validado: ['encerramento', 'ajuste', 'revisao', 'descarte'],
    encerrado: ['revisao'],
    descartado: ['revisao']
  });
  const reviewWorkflowUiState = {
    dateKey: '',
    locale: 'pt-BR',
    periodType: 'daily',
    referenceDate: '',
    detailed: null,
    quality: {},
    pendingByWorkflow: new Map()
  };
  const reviewModalState = {
    open: false,
    action: '',
    workflowId: '',
    item: null,
    resolver: null
  };
  const DEFAULT_MODULE_KEY = 'operacao';
  const MODULE_KEYS = Object.freeze([
    'painel_dia',
    'operacao',
    'analise_tecnica',
    'tecnicos',
    'clientes',
    'comparativos',
    'laudo',
    'governanca'
  ]);
  const MODULE_DEFAULT_TAB = Object.freeze({
    painel_dia: 'interna',
    operacao: 'interna',
    analise_tecnica: 'interna',
    tecnicos: 'externa',
    clientes: 'externa',
    comparativos: 'trimestral',
    laudo: 'externa',
    governanca: 'externa'
  });
  const MODULE_OWNER_BY_KEY = Object.freeze({
    painel_dia: 'resumo',
    operacao: 'operacao',
    analise_tecnica: 'analise',
    tecnicos: 'tecnicos',
    clientes: 'clientes',
    comparativos: 'comparativos',
    laudo: 'laudo',
    governanca: 'governanca'
  });
  const MODULE_ROOT_BY_KEY = Object.freeze({
    painel_dia: 'gmModuleResumo',
    operacao: 'gmModuleOperacao',
    analise_tecnica: 'gmModuleAnalise',
    tecnicos: 'gmModuleTecnicos',
    clientes: 'gmModuleClientes',
    comparativos: 'gmModuleComparativos',
    laudo: 'gmModuleLaudo',
    governanca: 'gmModuleGovernanca'
  });
  const MODULE_KEY_BY_OWNER = Object.freeze(Object.entries(MODULE_OWNER_BY_KEY)
    .reduce((acc, [moduleKey, owner]) => {
      acc[owner] = moduleKey;
      return acc;
    }, {}));
  const FILTER_AXIS_META = Object.freeze({
    clients: { containerId: 'gmFilterClientChecks', searchId: 'gmFilterClientSearch', countId: 'gmFilterClientCount' },
    cnpj: { containerId: 'gmFilterCnpjChecks', searchId: 'gmFilterCnpjSearch', countId: 'gmFilterCnpjCount' },
    technicians: { containerId: 'gmFilterTechnicianChecks', searchId: 'gmFilterTechnicianSearch', countId: 'gmFilterTechnicianCount' },
    serviceTypes: { containerId: 'gmFilterServiceChecks', searchId: 'gmFilterServiceSearch', countId: 'gmFilterServiceCount' },
    warranty: { containerId: 'gmFilterWarrantyChecks', searchId: 'gmFilterWarrantySearch', countId: 'gmFilterWarrantyCount' },
    retorno: { containerId: 'gmFilterRetornoChecks', searchId: 'gmFilterRetornoSearch', countId: 'gmFilterRetornoCount' },
    equipment: { containerId: 'gmFilterEquipmentChecks', searchId: 'gmFilterEquipmentSearch', countId: 'gmFilterEquipmentCount' },
    criticity: { containerId: 'gmFilterCriticityChecks', searchId: 'gmFilterCriticitySearch', countId: 'gmFilterCriticityCount' }
  });
  const FILTER_AXIS_KEYS = Object.freeze(Object.keys(FILTER_AXIS_META));
  let activeModuleKey = DEFAULT_MODULE_KEY;
  let activeViewMode = 'executivo';
  let lastInsightsPayload = null;
  let lastOsAuditPayload = null;
  let appliedInsightsFilters = null;
  let filterOptionsCache = {};
  const insightsPayloadCache = new Map();
  const insightsInFlight = new Map();
  const INSIGHTS_CACHE_TTL_MS = 120000;
  const MAX_INSIGHTS_CACHE_ENTRIES = 8;
  const equipmentEvidenceCache = new Map();
  let equipmentEvidenceBound = false;
  let lastAiAutoAnalysisKey = '';
  let equipmentIntelExpanded = false;
  const filterSearchState = {
    clients: '',
    cnpj: '',
    technicians: '',
    serviceTypes: '',
    warranty: '',
    retorno: '',
    equipment: '',
    criticity: ''
  };
  let filterAutoApplyTimer = 0;
  let filterRefreshInFlight = false;
  const HIST_TECH_RANK_DEFAULT_LIMIT = 10;
  let histTechniciansShowAll = false;
  let queuedRefreshDate = null;
  let moduleRootsInitialized = false;
  let autoFallbackDateAttempted = false;
  let activeFallbackNotice = null;

  function isPerfDebugEnabled() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('debugPerf') === '1') return true;
      return localStorage.getItem('gm_perf_debug') === '1'
        || sessionStorage.getItem('gm_perf_debug') === '1';
    } catch (_) {
      return false;
    }
  }

  function perfInfo(message) {
    if (!isPerfDebugEnabled()) return;
    console.info(message);
  }

  function perfTime(label) {
    if (!isPerfDebugEnabled()) return;
    console.time(label);
  }

  function perfTimeEnd(label) {
    if (!isPerfDebugEnabled()) return;
    console.timeEnd(label);
  }

  function clearInsightsRuntimeCache() {
    insightsPayloadCache.clear();
    insightsInFlight.clear();
  }

  function clearInsightsCacheForDate(dateLike) {
    const date = String(dateLike || activeDate() || '').trim();
    if (!date) {
      clearInsightsRuntimeCache();
      return;
    }
    const filters = ensureAppliedInsightsFilters();
    const cacheKey = getInsightsCacheKey(date, filters, getLanguageTag());
    insightsPayloadCache.delete(cacheKey);
    insightsInFlight.delete(cacheKey);
  }

  function emptyInsightsFilters() {
    return {
      period: 'monthly',
      clients: [],
      cnpj: [],
      technicians: [],
      serviceTypes: [],
      warranty: [],
      retorno: [],
      equipment: [],
      criticity: []
    };
  }

  function normalizeInsightsFilters(filtersLike) {
    const source = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
    const normalizeList = (valueLike) => {
      const list = Array.isArray(valueLike) ? valueLike : [];
      const seen = new Set();
      const ordered = [];
      list.forEach((itemLike) => {
        const value = String(itemLike || '').trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        ordered.push(value);
      });
      return ordered;
    };
    const periodRaw = String(source.period || '').trim().toLowerCase();
    return {
      period: ['daily', 'monthly', 'quarterly', 'ytd', 'historical'].includes(periodRaw) ? periodRaw : 'monthly',
      clients: normalizeList(source.clients),
      cnpj: normalizeList(source.cnpj),
      technicians: normalizeList(source.technicians),
      serviceTypes: normalizeList(source.serviceTypes),
      warranty: normalizeList(source.warranty),
      retorno: normalizeList(source.retorno),
      equipment: normalizeList(source.equipment),
      criticity: normalizeList(source.criticity)
    };
  }

  function cloneInsightsFilters(filtersLike) {
    return normalizeInsightsFilters(filtersLike);
  }

  function ensureAppliedInsightsFilters() {
    if (!appliedInsightsFilters) appliedInsightsFilters = emptyInsightsFilters();
    appliedInsightsFilters = normalizeInsightsFilters(appliedInsightsFilters);
    return appliedInsightsFilters;
  }

  function readStoredViewMode() {
    try {
      const value = String(localStorage.getItem('gm_view_mode') || '').trim().toLowerCase();
      return value === 'tecnico' ? 'tecnico' : 'executivo';
    } catch (_) {
      return 'executivo';
    }
  }

  function writeStoredViewMode(modeLike) {
    try {
      const mode = String(modeLike || '').trim().toLowerCase() === 'tecnico' ? 'tecnico' : 'executivo';
      localStorage.setItem('gm_view_mode', mode);
    } catch (_) {}
  }

  function normalizeModuleKey(moduleLike) {
    const key = String(moduleLike || '').trim().toLowerCase();
    return MODULE_KEYS.includes(key) ? key : DEFAULT_MODULE_KEY;
  }

  function getSelectedValuesFromChecklist(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"][data-filter-key]:checked'))
      .map((input) => String(input.getAttribute('data-filter-key') || '').trim())
      .filter(Boolean);
  }

  function setSelectedValuesToChecklist(containerId, valuesLike) {
    const selectedSet = new Set(Array.isArray(valuesLike) ? valuesLike.map((v) => String(v || '').trim()).filter(Boolean) : []);
    const container = document.getElementById(containerId);
    if (!container) return;
    Array.from(container.querySelectorAll('input[type="checkbox"][data-filter-key]')).forEach((input) => {
      const key = String(input.getAttribute('data-filter-key') || '').trim();
      input.checked = selectedSet.has(key);
    });
  }

  function getSelectedValuesByAxis(axisKey) {
    const meta = FILTER_AXIS_META[axisKey];
    if (!meta) return [];
    return getSelectedValuesFromChecklist(meta.containerId);
  }

  function resolveChecklistFilteredOptions(axisKey, optionsLike) {
    const options = Array.isArray(optionsLike) ? optionsLike : [];
    const searchText = String(filterSearchState[axisKey] || '').trim().toLowerCase();
    if (!searchText) return options;
    return options.filter((itemLike) => {
      const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
      const searchTokens = [
        item.key,
        item.label,
        item.search
      ];
      if (Array.isArray(item.aliases)) searchTokens.push(...item.aliases);
      if (Array.isArray(item.tokens)) searchTokens.push(...item.tokens);
      const haystack = searchTokens
        .map((valueLike) => String(valueLike || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
      return haystack.includes(searchText);
    });
  }

  function updateFilterGroupCounter(axisKey, selectedCount, totalCount) {
    const meta = FILTER_AXIS_META[axisKey];
    if (!meta) return;
    const counter = document.getElementById(meta.countId);
    if (!counter) return;
    const selected = Math.max(0, Number(selectedCount || 0));
    const total = Math.max(0, Number(totalCount || 0));
    counter.textContent = `${selected}/${total}`;
  }

  function renderSearchableFilterChecklist(axisKey, optionsLike, selectedValuesLike, emptyLabel) {
    const options = Array.isArray(optionsLike) ? optionsLike : [];
    const selectedSet = new Set(Array.isArray(selectedValuesLike) ? selectedValuesLike.map((v) => String(v || '').trim()) : []);
    const meta = FILTER_AXIS_META[axisKey];
    if (!meta) return;
    const containerId = meta.containerId;
    const container = document.getElementById(containerId);
    if (!container) return;
    const list = resolveChecklistFilteredOptions(axisKey, options);
    const optionKeySet = new Set(options
      .map((itemLike) => String((itemLike && typeof itemLike === 'object') ? itemLike.key || '' : '').trim())
      .filter(Boolean));
    const selectedCount = Array.from(selectedSet).filter((key) => optionKeySet.has(key)).length;
    updateFilterGroupCounter(axisKey, selectedCount, optionKeySet.size);

    if (!list.length) {
      container.innerHTML = `<div class="gm-check-empty">${escapeHtml(emptyLabel)}</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    list.slice(0, 200).forEach((itemLike) => {
      const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
      const key = String(item.key || '').trim();
      const label = String(item.label || item.key || '').trim();
      if (!key || !label) return;
      const wrap = document.createElement('label');
      wrap.className = 'gm-check-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('data-filter-axis', axisKey);
      input.setAttribute('data-filter-key', key);
      input.checked = selectedSet.has(key);
      const text = document.createElement('span');
      text.textContent = label;
      wrap.appendChild(input);
      wrap.appendChild(text);
      fragment.appendChild(wrap);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  function resetFilterSearchInputs() {
    FILTER_AXIS_KEYS.forEach((axisKey) => {
      filterSearchState[axisKey] = '';
      const input = document.getElementById(FILTER_AXIS_META[axisKey].searchId);
      if (input) input.value = '';
    });
  }

  function collectInsightsFiltersFromUI() {
    const periodRaw = String(document.getElementById('gmFilterPeriod')?.value || '').trim().toLowerCase();
    const period = ['daily', 'monthly', 'quarterly', 'historical'].includes(periodRaw) ? periodRaw : 'monthly';
    return normalizeInsightsFilters({
      period,
      clients: getSelectedValuesByAxis('clients'),
      cnpj: getSelectedValuesByAxis('cnpj'),
      technicians: getSelectedValuesByAxis('technicians'),
      serviceTypes: getSelectedValuesByAxis('serviceTypes'),
      warranty: getSelectedValuesByAxis('warranty'),
      retorno: getSelectedValuesByAxis('retorno'),
      equipment: getSelectedValuesByAxis('equipment'),
      criticity: getSelectedValuesByAxis('criticity')
    });
  }

  function applyInsightsFiltersToUI(filtersLike) {
    const filters = normalizeInsightsFilters(filtersLike);
    const periodSelect = document.getElementById('gmFilterPeriod');
    if (periodSelect) periodSelect.value = filters.period || 'monthly';
    setSelectedValuesToChecklist(FILTER_AXIS_META.clients.containerId, filters.clients);
    setSelectedValuesToChecklist(FILTER_AXIS_META.cnpj.containerId, filters.cnpj);
    setSelectedValuesToChecklist(FILTER_AXIS_META.technicians.containerId, filters.technicians);
    setSelectedValuesToChecklist(FILTER_AXIS_META.serviceTypes.containerId, filters.serviceTypes);
    setSelectedValuesToChecklist(FILTER_AXIS_META.warranty.containerId, filters.warranty);
    setSelectedValuesToChecklist(FILTER_AXIS_META.retorno.containerId, filters.retorno);
    setSelectedValuesToChecklist(FILTER_AXIS_META.equipment.containerId, filters.equipment);
    setSelectedValuesToChecklist(FILTER_AXIS_META.criticity.containerId, filters.criticity);
  }

  function activeFilterCount(filtersLike) {
    const filters = normalizeInsightsFilters(filtersLike);
    const listCount = [
      filters.clients,
      filters.cnpj,
      filters.technicians,
      filters.serviceTypes,
      filters.warranty,
      filters.retorno,
      filters.equipment,
      filters.criticity
    ].reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);
    return listCount + (filters.period && filters.period !== 'monthly' ? 1 : 0);
  }

  function resolvePainelNavElement() {
    const direct = document.getElementById('gmMainPainelNav');
    if (direct) return direct;
    return Array.from(document.querySelectorAll('.sidebar .nav'))
      .find((node) => String(node.getAttribute('onclick') || '').includes("'painel'")) || null;
  }

  function ensurePainelSectionVisible() {
    const painel = document.getElementById('painel');
    if (painel && painel.classList.contains('active')) return;
    const nav = resolvePainelNavElement();
    if (typeof window.show === 'function') {
      window.show('painel', nav || null);
      return;
    }
    if (painel) {
      document.querySelectorAll('.section').forEach((sectionNode) => sectionNode.classList.remove('active'));
      painel.classList.add('active');
    }
  }

  function hasAnySelectedFilter(filtersLike) {
    const filters = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
    return (
      (Array.isArray(filters.clients) && filters.clients.length > 0)
      || (Array.isArray(filters.cnpj) && filters.cnpj.length > 0)
      || (Array.isArray(filters.technicians) && filters.technicians.length > 0)
      || (Array.isArray(filters.serviceTypes) && filters.serviceTypes.length > 0)
      || (Array.isArray(filters.warranty) && filters.warranty.length > 0)
      || (Array.isArray(filters.retorno) && filters.retorno.length > 0)
      || (Array.isArray(filters.equipment) && filters.equipment.length > 0)
      || (Array.isArray(filters.criticity) && filters.criticity.length > 0)
    );
  }

  function buildInsightsFilterQuery(filtersLike) {
    const filters = (filtersLike && typeof filtersLike === 'object') ? filtersLike : {};
    const params = new URLSearchParams();
    if (filters.period && filters.period !== 'monthly') params.set('period', filters.period);
    const appendList = (key, valuesLike) => {
      const values = Array.isArray(valuesLike) ? valuesLike.map((v) => String(v || '').trim()).filter(Boolean) : [];
      if (!values.length) return;
      params.set(key, values.join(','));
    };
    appendList('client', filters.clients);
    appendList('cnpj', filters.cnpj);
    appendList('technician', filters.technicians);
    appendList('serviceType', filters.serviceTypes);
    appendList('warranty', filters.warranty);
    appendList('retorno', filters.retorno);
    appendList('equipment', filters.equipment);
    appendList('criticity', filters.criticity);
    return params.toString();
  }

  function resolveActiveModuleOwner() {
    return MODULE_OWNER_BY_KEY[activeModuleKey] || MODULE_OWNER_BY_KEY[DEFAULT_MODULE_KEY] || 'operacao';
  }

  function initializeDedicatedModuleRoots() {
    if (moduleRootsInitialized) return;
    moduleRootsInitialized = true;
    const painel = document.getElementById('painel');
    if (!painel) return;

    const rootsByKey = {};
    MODULE_KEYS.forEach((moduleKey) => {
      const rootId = MODULE_ROOT_BY_KEY[moduleKey];
      const root = rootId ? document.getElementById(rootId) : null;
      if (root) rootsByKey[moduleKey] = root;
    });

    Array.from(document.querySelectorAll('[data-module-owner]')).forEach((node) => {
      const owner = String(node.getAttribute('data-module-owner') || '').trim().toLowerCase();
      const moduleKey = MODULE_KEY_BY_OWNER[owner] || '';
      const root = rootsByKey[moduleKey];
      if (!root) return;
      if (root !== node.parentElement) root.appendChild(node);
      if (moduleKey !== 'painel_dia') {
        node.classList.remove('gm-view-tecnico-only');
        node.querySelectorAll('.gm-view-tecnico-only').forEach((child) => child.classList.remove('gm-view-tecnico-only'));
      }
    });

    Array.from(document.querySelectorAll('[data-module-shell],[data-module-row],#gmTaxonomyCard,.gm-tax-head,.gm-tax-context,.gm-tax-tabs,#gmTabPanelInterna,#gmTabPanelExterna'))
      .forEach((node) => {
        if (node.closest('[data-gm-module-root]')) return;
        node.classList.add('gm-legacy-hidden');
      });

    const keepIds = new Set(['gmPanelToolbar', 'gmFilterChips', 'gmFilterDrawer', 'gmModuleRoots']);
    Array.from(painel.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      if (keepIds.has(child.id)) return;
      if (child.classList.contains('header-clean')) return;
      if (child.hasAttribute('data-gm-module-root')) return;
      if (child.closest('[data-gm-module-root]')) return;
      child.classList.add('gm-legacy-hidden');
    });
  }

  function applyModuleVisibility() {
    const activeModuleOwner = resolveActiveModuleOwner();
    initializeDedicatedModuleRoots();
    const painel = document.getElementById('painel');
    if (painel) {
      painel.classList.toggle('gm-view-executivo', activeViewMode === 'executivo');
      painel.classList.toggle('gm-view-tecnico', activeViewMode === 'tecnico');
    }
    document.querySelectorAll('.gm-module-btn[data-gm-module]').forEach((btn) => {
      const key = normalizeModuleKey(btn.dataset.gmModule || '');
      btn.classList.toggle('is-active', key === activeModuleKey);
    });
    document.querySelectorAll('.gm-view-btn[data-gm-view]').forEach((btn) => {
      const mode = String(btn.dataset.gmView || '').trim().toLowerCase() === 'tecnico' ? 'tecnico' : 'executivo';
      btn.classList.toggle('is-active', mode === activeViewMode);
    });
    document.querySelectorAll('[data-gm-module-root]').forEach((node) => {
      const moduleKey = normalizeModuleKey(String(node.getAttribute('data-gm-module-root') || '').trim());
      const visible = moduleKey === activeModuleKey;
      node.classList.toggle('is-active', visible);
      node.classList.toggle('gm-module-hidden', !visible);
    });
    document.querySelectorAll('[data-module-owner]').forEach((node) => {
      const owner = String(node.getAttribute('data-module-owner') || '').trim().toLowerCase();
      const visible = owner === 'all' || owner === activeModuleOwner;
      node.classList.toggle('gm-module-hidden', !visible);
    });
    const viewModeWrap = document.getElementById('gmViewMode');
    if (viewModeWrap) viewModeWrap.hidden = !['analise_tecnica', 'tecnicos'].includes(activeModuleKey);
    const mobileModuleSelect = document.getElementById('gmMobileModuleSelect');
    if (mobileModuleSelect && mobileModuleSelect.value !== activeModuleKey) {
      mobileModuleSelect.value = activeModuleKey;
    }
  }

  function moduleRequiresTaxonomy(moduleLike) {
    const moduleKey = normalizeModuleKey(moduleLike);
    return moduleKey !== 'painel_dia';
  }

  function setActiveModule(moduleLike, optionsLike) {
    const options = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
    const next = normalizeModuleKey(moduleLike);
    activeModuleKey = next;
    if (next === 'painel_dia') activeViewMode = 'executivo';
    else if (next === 'analise_tecnica' || next === 'tecnicos') activeViewMode = readStoredViewMode();
    else activeViewMode = 'tecnico';
    ensurePainelSectionVisible();
    const preferredTab = normalizeTabKey(MODULE_DEFAULT_TAB[next] || 'interna');
    setAnalyticsTab(preferredTab);
    applyModuleVisibility();
    if (moduleRequiresTaxonomy(next) && lastInsightsPayload && options.skipRender !== true) {
      renderTaxonomy(lastInsightsPayload);
    }
    if (!lastInsightsPayload && options.skipRefresh !== true) {
      if (moduleRequiresTaxonomy(next)) setTechnicalAnalysisLoadingState();
      refreshGodMode().catch(() => {});
    }
  }

  function hasLoadedFilterOptions() {
    const available = (filterOptionsCache && typeof filterOptionsCache === 'object') ? filterOptionsCache : {};
    return FILTER_AXIS_KEYS.some((axisKey) => Array.isArray(available[axisKey]) && available[axisKey].length > 0);
  }

  function setFilterDrawerState(openLike) {
    const drawer = document.getElementById('gmFilterDrawer');
    if (!drawer) return;
    const shouldOpen = openLike === true;
    if (shouldOpen && timer) {
      clearTimeout(timer);
      timer = 0;
    }
    drawer.classList.toggle('is-open', shouldOpen);
    drawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    document.body.classList.toggle('gm-filter-drawer-open', shouldOpen);
    if (shouldOpen) {
      if (!hasLoadedFilterOptions() && !filterRefreshInFlight && getToken() && !isAuthLocked()) {
        refreshGodMode().catch(() => {});
      }
      setTimeout(() => {
        const target = document.getElementById('gmFilterPeriod');
        if (target && typeof target.focus === 'function') target.focus();
      }, 0);
    }
  }

  function closeFilterDrawer() {
    setFilterDrawerState(false);
  }

  function bindModuleAndViewControls() {
    document.querySelectorAll('.gm-module-btn[data-gm-module]').forEach((btn) => {
      if (btn.dataset.gmBound === '1') return;
      btn.dataset.gmBound = '1';
      btn.addEventListener('click', () => {
        setActiveModule(btn.dataset.gmModule);
      });
    });
    document.querySelectorAll('.gm-view-btn[data-gm-view]').forEach((btn) => {
      if (btn.dataset.gmViewBound === '1') return;
      btn.dataset.gmViewBound = '1';
      btn.addEventListener('click', () => {
        activeViewMode = String(btn.dataset.gmView || '').trim().toLowerCase() === 'tecnico' ? 'tecnico' : 'executivo';
        writeStoredViewMode(activeViewMode);
        applyModuleVisibility();
      });
    });
    const applyBtn = document.getElementById('gmApplyFiltersBtn');
    if (applyBtn && applyBtn.dataset.gmBound !== '1') {
      applyBtn.dataset.gmBound = '1';
      applyBtn.addEventListener('click', () => {
        if (filterAutoApplyTimer) {
          clearTimeout(filterAutoApplyTimer);
          filterAutoApplyTimer = 0;
        }
        appliedInsightsFilters = collectInsightsFiltersFromUI();
        renderLocalFilterPreview(appliedInsightsFilters);
        closeFilterDrawer();
        refreshGodMode().catch(() => {});
      });
    }
    const clearBtn = document.getElementById('gmClearFiltersBtn');
    if (clearBtn && clearBtn.dataset.gmBound !== '1') {
      clearBtn.dataset.gmBound = '1';
      clearBtn.addEventListener('click', () => {
        const empty = emptyInsightsFilters();
        resetFilterSearchInputs();
        applyInsightsFiltersToUI(empty);
        appliedInsightsFilters = cloneInsightsFilters(empty);
        rerenderSearchableFilterChecklists(getLanguageTag(), getTaxonomyTexts(getLanguageTag()));
        renderLocalFilterPreview(appliedInsightsFilters);
        closeFilterDrawer();
        refreshGodMode().catch(() => {});
      });
    }
    const searchBindings = FILTER_AXIS_KEYS.map((axis) => [FILTER_AXIS_META[axis].searchId, axis]);
    searchBindings.forEach(([id, axis]) => {
      const input = document.getElementById(id);
      if (!input || input.dataset.gmBound === '1') return;
      input.dataset.gmBound = '1';
      input.addEventListener('input', () => {
        filterSearchState[axis] = String(input.value || '').trim();
        rerenderSearchableFilterChecklists(getLanguageTag(), getTaxonomyTexts(getLanguageTag()));
      });
    });
    FILTER_AXIS_KEYS.map((axis) => FILTER_AXIS_META[axis].containerId).forEach((id) => {
      const container = document.getElementById(id);
      if (!container || container.dataset.gmBound === '1') return;
      container.dataset.gmBound = '1';
      container.addEventListener('change', (event) => {
        if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox') return;
        queueAutoApplyFilters();
      });
    });
    document.querySelectorAll('.gm-filter-group-action[data-filter-axis][data-filter-action]').forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement) || btn.dataset.gmBound === '1') return;
      btn.dataset.gmBound = '1';
      btn.addEventListener('click', () => {
        applyFilterAxisAction(btn.dataset.filterAxis || '', btn.dataset.filterAction || '');
      });
    });
    const periodSelect = document.getElementById('gmFilterPeriod');
    if (periodSelect && periodSelect.dataset.gmBound !== '1') {
      periodSelect.dataset.gmBound = '1';
      periodSelect.addEventListener('change', () => {
        queueAutoApplyFilters();
      });
    }
    const openBtn = document.getElementById('gmOpenFiltersBtn');
    if (openBtn && openBtn.dataset.gmBound !== '1') {
      openBtn.dataset.gmBound = '1';
      openBtn.addEventListener('click', () => {
        setFilterDrawerState(true);
      });
    }
    const closeBtn = document.getElementById('gmCloseFiltersBtn');
    if (closeBtn && closeBtn.dataset.gmBound !== '1') {
      closeBtn.dataset.gmBound = '1';
      closeBtn.addEventListener('click', () => {
        closeFilterDrawer();
      });
    }
    const backdrop = document.getElementById('gmFilterDrawerBackdrop');
    if (backdrop && backdrop.dataset.gmBound !== '1') {
      backdrop.dataset.gmBound = '1';
      backdrop.addEventListener('click', () => {
        closeFilterDrawer();
      });
    }
    if (document.body.dataset.gmFilterEscBound !== '1') {
      document.body.dataset.gmFilterEscBound = '1';
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeFilterDrawer();
      });
    }
    const mobileModuleSelect = document.getElementById('gmMobileModuleSelect');
    if (mobileModuleSelect && mobileModuleSelect.dataset.gmBound !== '1') {
      mobileModuleSelect.dataset.gmBound = '1';
      mobileModuleSelect.addEventListener('change', () => {
        setActiveModule(mobileModuleSelect.value || DEFAULT_MODULE_KEY);
      });
    }

    const histPeriodSelect = document.getElementById('gmHistTechPeriodSelect');
    if (histPeriodSelect && histPeriodSelect.dataset.gmBound !== '1') {
      histPeriodSelect.dataset.gmBound = '1';
      histPeriodSelect.addEventListener('change', () => {
        const raw = String(histPeriodSelect.value || '').trim().toLowerCase();
        const next = ['monthly', 'quarterly', 'ytd', 'historical'].includes(raw) ? raw : 'monthly';
        const filters = ensureAppliedInsightsFilters();
        filters.period = next;
        appliedInsightsFilters = normalizeInsightsFilters(filters);
        const drawerSelect = document.getElementById('gmFilterPeriod');
        if (drawerSelect) drawerSelect.value = next;
        refreshGodMode().catch(() => {});
      });
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPct(value, locale, decimals) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0%';
    const d = Number.isFinite(Number(decimals)) ? Number(decimals) : 1;
    const tag = locale === 'en-US' ? 'en-US' : 'pt-BR';
    return `${n.toLocaleString(tag, { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
  }

  function normalizeTabKey(tabLike) {
    const key = String(tabLike || '').toLowerCase();
    if (key === 'externa' || key === 'trimestral' || key === 'interna') return key;
    return 'interna';
  }

  function setAnalyticsTab(tabLike) {
    const tab = normalizeTabKey(tabLike);
    activeAnalyticsTab = tab;
    Object.keys(ANALYTICS_TAB_PANEL_MAP).forEach((key) => {
      const isActive = key === tab;
      const btn = document.querySelector(`.gm-tax-tab[data-gm-tab="${key}"]`);
      const panel = document.getElementById(ANALYTICS_TAB_PANEL_MAP[key]);
      if (btn) {
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
      if (panel) {
        panel.classList.toggle('is-active', isActive);
        if (isActive) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', 'hidden');
      }
    });
    applyModuleVisibility();
  }

  function bindAnalyticsTabs() {
    const buttons = document.querySelectorAll('.gm-tax-tab[data-gm-tab]');
    buttons.forEach((btn) => {
      if (btn.dataset.gmTabBound === '1') return;
      btn.dataset.gmTabBound = '1';
      btn.addEventListener('click', () => {
        const tab = normalizeTabKey(btn.dataset.gmTab);
        setAnalyticsTab(tab);
        if (tab === 'trimestral') {
          refreshQuarterlyExecutivePanel({ forceReload: false }).catch(() => {});
        }
      });
    });
    setAnalyticsTab(activeAnalyticsTab);
  }

  function getTaxonomyTexts(locale) {
    const isEn = locale === 'en-US';
    return isEn
      ? {
          kicker: 'Taxonomy intelligence layer',
          title: 'Operational intelligence and technical report',
          tabInternal: 'Internal Operation',
          tabExternal: 'External Analysis / Report',
          tabQuarterly: 'Quarterly Executive',
          periodLabel: 'Period',
          scopeLabel: 'Scope',
          scopeDaily: 'Daily',
          scopeMonthly: 'Monthly',
          scopeQuarterly: 'Quarterly',
          scopeHistorical: 'Full history',
          filterTitle: 'Smart filters',
          filterHint: 'Context cuts without changing the original baseline.',
          filterPeriod: 'Period',
          filterClient: 'Client',
          filterCnpj: 'CNPJ',
          filterCnpjAdvanced: 'CNPJ (advanced)',
          filterTechnician: 'Technician',
          filterServiceType: 'Service type',
          filterWarranty: 'Warranty',
          filterRetorno: 'New / return',
          filterEquipment: 'Equipment',
          filterCriticity: 'Criticality',
          filterApply: 'Apply filters',
          filterClear: 'Clear filters',
          filterSelectAll: 'Select all',
          filterClearSelection: 'Clear',
          filterOpenBtn: 'Filters',
          filterChipsClear: 'Clear',
          filterStatusNone: 'No active filters.',
          filterStatusActive: '{count} active filter(s) applied.',
          filterStatusNoResults: 'No results for the applied filters.',
          filterNoOptions: 'No options',
          filterSearchPlaceholder: 'Search...',
          panelSummaryTitle: 'Day panel',
          panelSummaryHint: 'Quick reading for decision and operational recut.',
          modulePainel: 'Day Panel',
          moduleOperacao: 'Operation',
          moduleAnalise: 'Technical Analysis',
          moduleTecnicos: 'Technicians',
          moduleClientes: 'Clients',
          moduleComparativos: 'Comparatives',
          moduleLaudo: 'Report / Quality',
          moduleGovernanca: 'Governance',
          viewModeLabel: 'Mode',
          viewModeExecutive: 'Summary',
          viewModeTechnical: 'Detailed',
          osAnalyzed: 'WO analyzed',
          taxBase: 'Taxonomy consolidated base',
          dominantService: 'Dominant service',
          coverage: 'Classification coverage',
          quality: 'Quality',
          qualityAvg: 'Avg confidence',
          qualityUnknown: 'Not identified',
          eqTitle: 'Equipment ranking',
          techTitle: 'Technician ranking',
          alertTitle: 'Tactical classification alerts',
          extNarrative: 'Executive reading',
          extFindings: 'Key findings',
          extRecommendations: 'Recommendations',
          extReviewTitle: 'Guided human review priority',
          extReviewSummaryTitle: 'Guided queue summary',
          extReviewQueueTitle: 'Short review queue',
          extQuality: 'Classification quality',
          level: 'Level',
          avgConfidence: 'Avg confidence',
          coverageShort: 'Coverage',
          unknownUndefined: 'Not identified / undefined',
          reviewPriorityLabel: 'Priority',
          reviewReviewerLabel: 'Recommended reviewer',
          reviewStatusLabel: 'Status',
          reviewDueAtLabel: 'Due',
          reviewTotalLabel: 'Queue items',
          reviewOpenLabel: 'Open',
          reviewOverdueLabel: 'Overdue',
          reviewByStatusLabel: 'By status',
          reviewHighestPriorityLabel: 'Highest priority',
          reviewNextDueAtLabel: 'Next due',
          reviewNoReason: 'No guided review reason for this period.',
          reviewNoChecklistTitle: 'Checklist',
          reviewNoChecklistText: 'No mandatory review checklist.',
          reviewNoQueueTitle: 'No review items',
          reviewNoQueueText: 'When analytical risk appears, items are listed here.',
          reviewImpactLabel: 'Impact',
          reviewEvidenceLabel: 'Evidence',
          reviewDueLabel: 'Due',
          reviewLastActionLabel: 'Last action',
          reviewHistoryLabel: 'Recent history',
          reviewNoDueAt: 'No due date',
          reviewNoStatus: 'Unmapped',
          reviewStatusNovo: 'New',
          reviewStatusEmRevisao: 'In review',
          reviewStatusAjustado: 'Adjusted',
          reviewStatusValidado: 'Validated',
          reviewStatusEncerrado: 'Closed',
          reviewStatusDescartado: 'Discarded',
          reviewStatusByShort: 'N/R/A/V/C/D',
          reviewOverdueBadge: 'Overdue',
          reviewActionDetected: 'Detected',
          reviewActionSyncUpdate: 'Sync update',
          reviewActionAutoReopen: 'Auto reopen',
          reviewActionAutoClose: 'Auto close',
           reviewActionAceite: 'Accepted',
           reviewActionAjuste: 'Adjustment requested',
           reviewActionRevisao: 'Moved to review',
           reviewActionEncerramento: 'Closed',
           reviewActionDescarte: 'Discarded',
           reviewBtnAccept: 'Accept',
           reviewBtnAdjust: 'Adjust',
           reviewBtnReview: 'Review',
           reviewBtnClose: 'Close',
           reviewBtnDiscard: 'Discard',
           reviewBtnLoading: 'Saving...',
           reviewActionsLabel: 'Actions',
           reviewNoActionAllowed: 'No actions allowed for your profile.',
           reviewConfirmClose: 'Confirm closing this review item?',
           reviewConfirmCloseWithAction: 'Close as \"with action\"? Press Cancel for \"without action\".',
           reviewConfirmDiscard: 'Confirm discarding this review item?',
           reviewPromptAdjustNote: 'Adjustment note (required):',
           reviewPromptReviewOwner: 'Owner user for review (required):',
           reviewPromptReviewDueAt: 'Review due date/time (required):',
           reviewPromptReviewNote: 'Review note (required):',
           reviewPromptCloseNote: 'Closing note (optional):',
           reviewPromptDiscardNote: 'Discard reason (required):',
           reviewInvalidRequired: 'Fill required fields before sending.',
           reviewInvalidDueAt: 'Invalid due date/time.',
           reviewSuccessAction: 'Review item updated.',
           reviewErrorForbidden: 'You do not have permission for this action.',
            reviewErrorConflict: 'Version conflict detected. Queue refreshed.',
            reviewErrorGeneric: 'Could not update review item now.',
            reviewErrorLoadQueue: 'Could not refresh review queue.',
            reviewConflictReloading: 'Reloading queue after version conflict...',
            reviewModalKicker: 'Guided human review',
            reviewModalTitleAjuste: 'Request adjustment',
            reviewModalTitleRevisao: 'Move to review',
            reviewModalTitleEncerramento: 'Close review item',
            reviewModalTitleDescarte: 'Discard review item',
            reviewModalCtxCodeLbl: 'Code',
            reviewModalCtxStatusLbl: 'Current status',
            reviewModalCtxPriorityLbl: 'Priority',
            reviewModalCtxReviewerLbl: 'Recommended reviewer',
            reviewModalOwnerLbl: 'Review owner',
            reviewModalDueLbl: 'Due date',
            reviewModalCloseModeLbl: 'Close mode',
            reviewModalNoteLbl: 'Observation',
            reviewModalCloseModeWithAction: 'Close with action',
            reviewModalCloseModeWithoutAction: 'Close without action',
            reviewModalSubmitAjuste: 'Confirm adjustment',
            reviewModalSubmitRevisao: 'Start review',
            reviewModalSubmitEncerramento: 'Confirm close',
            reviewModalSubmitDescarte: 'Confirm discard',
            reviewModalCancel: 'Cancel',
            reviewModalClose: 'Close',
            reviewModalNotePlaceholderAjuste: 'Describe the required adjustment.',
            reviewModalNotePlaceholderRevisao: 'Describe what must be reviewed.',
            reviewModalNotePlaceholderEncerramento: 'Optional closing context.',
            reviewModalNotePlaceholderDescarte: 'Explain why this item should be discarded.',
            reviewModalErrorRequired: 'Fill required fields to continue.',
            reviewModalErrorDueAt: 'Provide a valid due date/time.',
            reviewReviewerTag: 'Reviewer',
            reviewPriorityCritical: 'Critical',
            reviewPriorityHigh: 'High',
            reviewPriorityMedium: 'Medium',
            reviewPriorityLow: 'Low',
          reviewPriorityNone: 'None',
          reviewDefaultReviewer: 'Automatic monitor',
          axisWarrantyType: 'Warranty type',
          axisWarrantyStatus: 'Warranty status',
          noDataEq: 'Import WO to unlock recurrence by equipment.',
          noDataTech: 'Fill technician in WO to consolidate operational load.',
          noDataAlert: 'Waiting for taxonomy baseline for tactical risk reading.',
          noDataNarrative: 'No executive reading available for this date.',
          noDataFindings: 'As soon as data exists, findings are shown here.',
          noDataRecommendations: 'Waiting for analytical reading to recommend next actions.',
          noDataAxis: 'No axis quality baseline available.',
          noDataServiceChart: 'No service-type baseline for chart.',
          noDataPareto: 'No equipment baseline for pareto.',
          noBaseTitle: 'No baseline',
          noAlertsTitle: 'No alerts',
          noFindingsTitle: 'No findings',
          noRecommendationsTitle: 'No recommendations',
          axisTitle: 'Axes',
          noDataGeneral: 'No taxonomy data yet for this date.',
          actionRequired: 'Action required',
          monitor: 'Monitor',
          noAlerts: 'No tactical alert identified in taxonomy',
          woUnit: 'WO',
          confidence: 'Confidence',
          topCause: 'Top cause',
          topOutcome: 'Top outcome',
          prioritySeverity: 'Severity',
          priorityRisk: 'Main risk',
          priorityAction: 'Recommended action',
          serviceChartTitle: 'Service type distribution',
          chartTop5: 'Top 5',
          paretoTitle: 'Equipment pareto',
          chartTop6: 'Top 6',
          eqColItem: 'Equipment',
          eqColVolume: 'WO',
          eqColCause: 'Top cause',
          eqColOutcome: 'Top outcome',
          techColItem: 'Technician',
          techColVolume: 'WO',
          techColService: 'Service',
          techColOutcome: 'Outcome',
          internalScope: 'Daily tactical operation',
          axisChartTitle: 'Undefined/not identified by axis',
          severityStable: 'Stable',
          severityAttention: 'Attention',
          severityPressure: 'Pressure',
          severityCritical: 'Critical',
          noActionAvailable: 'No action recommendation yet',
          cockpitTitle: 'Operational Cockpit — Tagus-Tec Campinas',
          priorityCardTitle: 'Immediate priority',
          priorityTopAlert: 'Main alert',
          priorityAction24h: 'Action in 24h',
          priorityTicketsLate: 'Tickets and delays',
          priorityAdministrative: 'Administrative pending',
          priorityServiceMix: 'Service mix',
          priorityWarrantyMix: 'Warranty coverage',
          priorityTopEquipment: 'Most incident equipment',
          quarterlySelectLabel: 'Quarter',
          quarterlyDownloadPdf: 'Executive PDF',
          quarterlyDownloadExcel: 'Management Excel',
          quarterlyDownloadJson: 'Full JSON',
          quarterlyHeroTitle: 'Quarterly executive reading',
          quarterlyHeroSummary: 'Strategic quarterly package with consolidated operation, governance and decision support.',
          quarterlyHeroSummaryEmpty: 'No quarterly baseline for this period yet.',
          quarterlyPartialBadge: 'Partial baseline: {monthsWithData}/3 months',
          quarterlyQualityLowBadge: 'Low classification quality: review report',
          quarterlyLblQuarter: 'Reference quarter',
          quarterlyLblTotalOs: 'Consolidated WO',
          quarterlyLblSampleDays: 'Sampled days',
          quarterlyLblOpenQueue: 'Open review queue',
          quarterlyOverviewTitle: 'Quarter overview',
          quarterlyQualityTitle: 'Quality and coverage',
          quarterlyMixTitle: 'Primary mix',
          quarterlyReviewTitle: 'Short review queue (quarter)',
          quarterlyEqTitle: 'Top equipment',
          quarterlyEqColItem: 'Equipment',
          quarterlyEqColVolume: 'WO',
          quarterlyEqColCause: 'Dominant cause',
          quarterlyEqColOutcome: 'Dominant outcome',
          quarterlyNarrativeTitle: 'Quarterly executive narrative',
          quarterlyRefDate: 'Ref. date',
          quarterlyMonthsWithData: 'Months with data',
          quarterlyReworkRate: 'Rework',
          quarterlyOverdue: 'Overdue',
          quarterlyNoBaseTitle: 'No quarterly baseline',
          quarterlyNoBaseDetail: 'Select a quarter with consolidated records.',
          quarterlyNoMixTitle: 'No consolidated mix',
          quarterlyNoMixDetail: 'Waiting for quarterly consolidation.',
          quarterlyNoReviewTitle: 'No review items',
          quarterlyNoReviewDetail: 'Quarter governance items appear here when present.',
          quarterlyNoNarrative: 'No quarterly executive reading available for this period.',
          quarterlyNoFindingsTitle: 'No findings',
          quarterlyNoFindingsDetail: 'Key findings and recommendations appear when data is available.',
          quarterlyNoQueueDue: 'No due date',
          quarterlyOverviewFinancialRisk: 'Estimated financial risk',
          quarterlyOverviewCritical: 'Critical incidents',
          quarterlyOverviewAlerts: 'WO with alert',
          quarterlyOverviewTopProduct: 'Most incident product',
          quarterlyMixServiceType: 'Dominant service type',
          quarterlyMixWarrantyStatus: 'Dominant warranty status',
          quarterlyMixWarrantyType: 'Dominant warranty type',
          quarterlyMixCause: 'Top probable cause',
          quarterlyMixOutcome: 'Top outcome',
          quarterlyNarrativeExecutive: 'Executive summary',
          quarterlyNarrativeRisks: 'Quarter risks',
          quarterlyNarrativeActions: 'Recommended actions',
          quarterlyNarrativeHumanReview: 'Human-review points',
          quarterlyNarrativeLimitations: 'Data quality limitations',
          histClientsTitle: 'Clients / opportunities',
          histClientsTotal: 'Mapped clients',
          histClientsOpportunity: 'Opportunities',
          histClientsAlert: 'Alert',
          histClientsAttention: 'Attention',
          histNoClientsTitle: 'No opportunities',
          histNoClientsText: 'Waiting for historical client readings.',
          histClientDaysNoCall: 'No-call days',
          histClientRecurrence: 'Recurrence',
          histClientRecommendation: 'Recommendation',
          histTechniciansTitle: 'Technicians / performance',
          histTechTotal: 'Evaluated technicians',
          histTechAvgScore: 'Average score',
          histTechLowConfidence: 'Low confidence',
          histTechTop: 'Top performer',
          histTechColTech: 'Technician',
          histTechColScore: 'Score',
          histTechColReturn: 'Return %',
          histTechColAction: 'Recommended action',
          histNoTechTitle: 'No technical ranking',
          histNoTechText: 'Waiting for technician historical baseline.',
          histComparativesTitle: 'Historical comparatives',
          histNoComparativesTitle: 'No comparatives',
          histNoComparativesText: 'Waiting for historical baseline to compare periods.',
          histComparativeMonth: 'Month vs previous year',
          histComparativeQuarter: 'Quarter vs previous year',
          histComparativeYtd: 'YTD vs previous year',
          histComparativeDelta: 'Delta',
          histLaudoTitle: 'Technical report compliance',
          histLaudoScore: 'Compliance score',
          histLaudoLevel: 'Level',
          histLaudoMissingAction: 'Missing action',
          histLaudoMissingConclusion: 'Missing conclusion',
          histNoLaudoTitle: 'No compliance reading',
          histNoLaudoText: 'Waiting for report analysis in this period.',
          histLaudoRule: 'Golden rule',
          histLaudoRecommendation: 'Recommendation'
        }
      : {
          kicker: 'Leitura analitica por taxonomia',
          title: 'Inteligencia operacional e laudo tecnico',
          tabInternal: 'Operacao Interna',
          tabExternal: 'Analise Externa / Laudo',
          tabQuarterly: 'Executivo Trimestral',
          periodLabel: 'Periodo',
          scopeLabel: 'Escopo',
          scopeDaily: 'Diario',
          scopeMonthly: 'Mensal',
          scopeQuarterly: 'Trimestral',
          scopeHistorical: 'Historico completo',
          filterTitle: 'Filtros inteligentes',
          filterHint: 'Recorte por contexto sem alterar a base original.',
          filterPeriod: 'Periodo',
          filterClient: 'Cliente',
          filterCnpj: 'CNPJ',
          filterCnpjAdvanced: 'CNPJ (avancado)',
          filterTechnician: 'Tecnico',
          filterServiceType: 'Tipo de atendimento',
          filterWarranty: 'Garantia',
          filterRetorno: 'Novo / retorno',
          filterEquipment: 'Equipamento',
          filterCriticity: 'Criticidade',
          filterApply: 'Aplicar filtros',
          filterClear: 'Limpar filtros',
          filterSelectAll: 'Selecionar todos',
          filterClearSelection: 'Limpar',
          filterOpenBtn: 'Filtros',
          filterChipsClear: 'Limpar',
          filterStatusNone: 'Sem filtros ativos.',
          filterStatusActive: '{count} filtro(s) ativo(s).',
          filterStatusNoResults: 'Nenhum resultado para os filtros aplicados',
          filterNoOptions: 'Sem opcoes',
          filterSearchPlaceholder: 'Buscar...',
          panelSummaryTitle: 'Painel do dia',
          panelSummaryHint: 'Leitura rapida para decisao com recorte operacional.',
          modulePainel: 'Painel do Dia',
          moduleOperacao: 'Operacao',
          moduleAnalise: 'Analise Tecnica',
          moduleTecnicos: 'Tecnicos',
          moduleClientes: 'Clientes',
          moduleComparativos: 'Comparativos',
          moduleLaudo: 'Laudo / Qualidade',
          moduleGovernanca: 'Governanca',
          viewModeLabel: 'Modo',
          viewModeExecutive: 'Resumo',
          viewModeTechnical: 'Detalhado',
          osAnalyzed: 'O.S. analisadas',
          taxBase: 'Base consolidada da taxonomia',
          dominantService: 'Atendimento dominante',
          coverage: 'Cobertura de classificacao',
          quality: 'Qualidade',
          qualityAvg: 'Confianca media',
          qualityUnknown: 'Nao identificado',
          eqTitle: 'Ranking por equipamento',
          techTitle: 'Ranking por tecnico',
          alertTitle: 'Alertas taticos da classificacao',
          extNarrative: 'Leitura executiva',
          extFindings: 'Achados principais',
          extRecommendations: 'Recomendacoes',
          extReviewTitle: 'Prioridade de revisao humana guiada',
          extReviewSummaryTitle: 'Resumo da fila guiada',
          extReviewQueueTitle: 'Fila curta de revisao',
          extQuality: 'Qualidade da classificacao',
          level: 'Nivel',
          avgConfidence: 'Confianca media',
          coverageShort: 'Cobertura',
          unknownUndefined: 'Nao identificado / indefinido',
          reviewPriorityLabel: 'Prioridade',
          reviewReviewerLabel: 'Revisor recomendado',
          reviewStatusLabel: 'Status',
          reviewDueAtLabel: 'Prazo',
          reviewTotalLabel: 'Itens na fila',
          reviewOpenLabel: 'Em aberto',
          reviewOverdueLabel: 'Atrasados',
          reviewByStatusLabel: 'Por status',
          reviewHighestPriorityLabel: 'Maior prioridade',
          reviewNextDueAtLabel: 'Proximo prazo',
          reviewNoReason: 'Sem motivo de revisao guiada para este periodo.',
          reviewNoChecklistTitle: 'Checklist',
          reviewNoChecklistText: 'Sem checklist obrigatorio de revisao.',
          reviewNoQueueTitle: 'Sem itens de revisao',
          reviewNoQueueText: 'Quando houver risco analitico, os itens aparecem aqui.',
          reviewImpactLabel: 'Impacto',
          reviewEvidenceLabel: 'Evidencia',
          reviewDueLabel: 'Prazo',
          reviewLastActionLabel: 'Ultima acao',
          reviewHistoryLabel: 'Historico recente',
          reviewNoDueAt: 'Sem prazo',
          reviewNoStatus: 'Nao mapeado',
          reviewStatusNovo: 'Novo',
          reviewStatusEmRevisao: 'Em revisao',
          reviewStatusAjustado: 'Ajustado',
          reviewStatusValidado: 'Validado',
          reviewStatusEncerrado: 'Encerrado',
          reviewStatusDescartado: 'Descartado',
          reviewStatusByShort: 'N/R/A/V/E/D',
          reviewOverdueBadge: 'Atrasado',
          reviewActionDetected: 'Detectado',
          reviewActionSyncUpdate: 'Atualizado pela leitura',
          reviewActionAutoReopen: 'Reaberto automaticamente',
          reviewActionAutoClose: 'Encerrado automaticamente',
           reviewActionAceite: 'Aceite',
           reviewActionAjuste: 'Ajuste solicitado',
           reviewActionRevisao: 'Enviado para revisao',
           reviewActionEncerramento: 'Encerrado',
           reviewActionDescarte: 'Descartado',
           reviewBtnAccept: 'Aceitar',
           reviewBtnAdjust: 'Ajustar',
           reviewBtnReview: 'Revisar',
           reviewBtnClose: 'Encerrar',
           reviewBtnDiscard: 'Descartar',
           reviewBtnLoading: 'Salvando...',
           reviewActionsLabel: 'Acoes',
           reviewNoActionAllowed: 'Sem acoes permitidas para seu perfil.',
           reviewConfirmClose: 'Confirma o encerramento deste item de revisao?',
           reviewConfirmCloseWithAction: 'Encerrar como \"com acao\"? Cancelar aplica \"sem acao\".',
           reviewConfirmDiscard: 'Confirma o descarte deste item de revisao?',
           reviewPromptAdjustNote: 'Observacao do ajuste (obrigatoria):',
           reviewPromptReviewOwner: 'Usuario dono da revisao (obrigatorio):',
           reviewPromptReviewDueAt: 'Prazo da revisao (obrigatorio):',
           reviewPromptReviewNote: 'Observacao da revisao (obrigatoria):',
           reviewPromptCloseNote: 'Observacao de encerramento (opcional):',
           reviewPromptDiscardNote: 'Motivo do descarte (obrigatorio):',
           reviewInvalidRequired: 'Preencha os campos obrigatorios antes de enviar.',
           reviewInvalidDueAt: 'Prazo invalido.',
           reviewSuccessAction: 'Item de revisao atualizado.',
           reviewErrorForbidden: 'Seu perfil nao tem permissao para esta acao.',
            reviewErrorConflict: 'Conflito de versao detectado. Fila atualizada.',
            reviewErrorGeneric: 'Nao foi possivel atualizar o item agora.',
            reviewErrorLoadQueue: 'Nao foi possivel atualizar a fila guiada.',
            reviewConflictReloading: 'Atualizando fila apos conflito de versao...',
            reviewModalKicker: 'Revisao humana guiada',
            reviewModalTitleAjuste: 'Solicitar ajuste',
            reviewModalTitleRevisao: 'Enviar para revisao',
            reviewModalTitleEncerramento: 'Encerrar item de revisao',
            reviewModalTitleDescarte: 'Descartar item de revisao',
            reviewModalCtxCodeLbl: 'Codigo',
            reviewModalCtxStatusLbl: 'Status atual',
            reviewModalCtxPriorityLbl: 'Prioridade',
            reviewModalCtxReviewerLbl: 'Revisor recomendado',
            reviewModalOwnerLbl: 'Dono da revisao',
            reviewModalDueLbl: 'Prazo',
            reviewModalCloseModeLbl: 'Tipo de encerramento',
            reviewModalNoteLbl: 'Observacao',
            reviewModalCloseModeWithAction: 'Encerrar com acao',
            reviewModalCloseModeWithoutAction: 'Encerrar sem acao',
            reviewModalSubmitAjuste: 'Confirmar ajuste',
            reviewModalSubmitRevisao: 'Iniciar revisao',
            reviewModalSubmitEncerramento: 'Confirmar encerramento',
            reviewModalSubmitDescarte: 'Confirmar descarte',
            reviewModalCancel: 'Cancelar',
            reviewModalClose: 'Fechar',
            reviewModalNotePlaceholderAjuste: 'Descreva o ajuste necessario.',
            reviewModalNotePlaceholderRevisao: 'Descreva o que precisa ser revisado.',
            reviewModalNotePlaceholderEncerramento: 'Contexto opcional para encerramento.',
            reviewModalNotePlaceholderDescarte: 'Explique por que este item deve ser descartado.',
            reviewModalErrorRequired: 'Preencha os campos obrigatorios para continuar.',
            reviewModalErrorDueAt: 'Informe um prazo valido.',
            reviewReviewerTag: 'Revisor',
            reviewPriorityCritical: 'Critica',
            reviewPriorityHigh: 'Alta',
            reviewPriorityMedium: 'Media',
            reviewPriorityLow: 'Baixa',
          reviewPriorityNone: 'Sem fila',
          reviewDefaultReviewer: 'Monitoramento automatico',
          axisWarrantyType: 'Tipo de garantia',
          axisWarrantyStatus: 'Status de garantia',
          noDataEq: 'Importe O.S. para liberar recorrencia por equipamento.',
          noDataTech: 'Preencha tecnico na O.S. para consolidar carga operacional.',
          noDataAlert: 'Aguardando base para leitura de risco taxonomico.',
          noDataNarrative: 'Sem leitura executiva disponivel para esta data.',
          noDataFindings: 'Assim que houver base, os achados aparecem aqui.',
          noDataRecommendations: 'Aguardando leitura analitica para sugerir proximos passos.',
          noDataAxis: 'Sem base para qualidade por eixo.',
          noDataServiceChart: 'Sem base de atendimento para grafico.',
          noDataPareto: 'Sem base de equipamento para grafico.',
          noBaseTitle: 'Sem base',
          noAlertsTitle: 'Sem alertas',
          noFindingsTitle: 'Sem achados',
          noRecommendationsTitle: 'Sem recomendacoes',
          axisTitle: 'Eixos',
          noDataGeneral: 'Sem dados de taxonomia para esta data.',
          actionRequired: 'Acao necessaria',
          monitor: 'Monitorar',
          noAlerts: 'Sem alerta tatico relevante na taxonomia',
          woUnit: 'O.S.',
          confidence: 'Confianca',
          topCause: 'Causa dominante',
          topOutcome: 'Desfecho dominante',
          prioritySeverity: 'Severidade',
          priorityRisk: 'Principal risco',
          priorityAction: 'Acao recomendada',
          serviceChartTitle: 'Distribuicao por tipo de atendimento',
          chartTop5: 'Top 5',
          paretoTitle: 'Pareto por equipamento',
          chartTop6: 'Top 6',
          eqColItem: 'Equipamento',
          eqColVolume: 'O.S.',
          eqColCause: 'Causa dominante',
          eqColOutcome: 'Desfecho dominante',
          techColItem: 'Tecnico',
          techColVolume: 'O.S.',
          techColService: 'Atendimento',
          techColOutcome: 'Desfecho',
          internalScope: 'Operacao tatica do dia',
          axisChartTitle: 'Indefinido/nao identificado por eixo',
          severityStable: 'Estavel',
          severityAttention: 'Atencao',
          severityPressure: 'Pressao',
          severityCritical: 'Critica',
          noActionAvailable: 'Sem recomendacao de acao no momento',
          cockpitTitle: 'Cockpit Operacional — Tagus-Tec Campinas',
          priorityCardTitle: 'Cockpit Operacional',
          priorityTopAlert: 'Risco operacional do dia',
          priorityAction24h: 'Ação em 24h',
          priorityTicketsLate: 'Tickets e atrasos',
          priorityAdministrative: 'Pendências administrativas',
          priorityServiceMix: 'Mix de atendimento',
          priorityWarrantyMix: 'Cobertura de garantia',
          priorityTopEquipment: 'Equipamento mais incidente',
          quarterlySelectLabel: 'Trimestre',
          quarterlyDownloadPdf: 'PDF executivo',
          quarterlyDownloadExcel: 'Excel gerencial',
          quarterlyDownloadJson: 'JSON completo',
          quarterlyHeroTitle: 'Leitura executiva trimestral',
          quarterlyHeroSummary: 'Pacote trimestral consolidado com operacao, governanca e suporte a decisao.',
          quarterlyHeroSummaryEmpty: 'Sem base trimestral para este periodo.',
          quarterlyPartialBadge: 'Base parcial: {monthsWithData}/3 meses',
          quarterlyQualityLowBadge: 'Qualidade baixa: revisar laudo',
          quarterlyLblQuarter: 'Trimestre de referencia',
          quarterlyLblTotalOs: 'O.S. consolidadas',
          quarterlyLblSampleDays: 'Dias amostrados',
          quarterlyLblOpenQueue: 'Fila de revisao aberta',
          quarterlyOverviewTitle: 'Overview do trimestre',
          quarterlyQualityTitle: 'Qualidade e cobertura',
          quarterlyMixTitle: 'Mix principal',
          quarterlyReviewTitle: 'Fila curta de revisao (trimestre)',
          quarterlyEqTitle: 'Top equipamentos',
          quarterlyEqColItem: 'Equipamento',
          quarterlyEqColVolume: 'O.S.',
          quarterlyEqColCause: 'Causa dominante',
          quarterlyEqColOutcome: 'Desfecho dominante',
          quarterlyNarrativeTitle: 'Narrativa executiva trimestral',
          quarterlyRefDate: 'Data ref.',
          quarterlyMonthsWithData: 'Meses com base',
          quarterlyReworkRate: 'Retrabalho',
          quarterlyOverdue: 'Atrasados',
          quarterlyNoBaseTitle: 'Sem base trimestral',
          quarterlyNoBaseDetail: 'Selecione um trimestre com dados consolidados.',
          quarterlyNoMixTitle: 'Sem mix consolidado',
          quarterlyNoMixDetail: 'Aguardando consolidacao trimestral.',
          quarterlyNoReviewTitle: 'Sem itens de revisao',
          quarterlyNoReviewDetail: 'Os itens trimestrais de governanca aparecem aqui.',
          quarterlyNoNarrative: 'Sem leitura executiva trimestral para este periodo.',
          quarterlyNoFindingsTitle: 'Sem achados',
          quarterlyNoFindingsDetail: 'Quando houver base trimestral, os destaques aparecem aqui.',
          quarterlyNoQueueDue: 'Sem prazo',
          quarterlyOverviewFinancialRisk: 'Risco financeiro estimado',
          quarterlyOverviewCritical: 'Incidentes criticos',
          quarterlyOverviewAlerts: 'O.S. com alerta',
          quarterlyOverviewTopProduct: 'Produto mais incidente',
          quarterlyMixServiceType: 'Atendimento dominante',
          quarterlyMixWarrantyStatus: 'Status de garantia dominante',
          quarterlyMixWarrantyType: 'Tipo de garantia dominante',
          quarterlyMixCause: 'Causa provavel dominante',
          quarterlyMixOutcome: 'Desfecho dominante',
          quarterlyNarrativeExecutive: 'Resumo executivo',
          quarterlyNarrativeRisks: 'Riscos do trimestre',
          quarterlyNarrativeActions: 'Acoes recomendadas',
          quarterlyNarrativeHumanReview: 'Pontos com revisao humana',
          quarterlyNarrativeLimitations: 'Limitacoes da qualidade de dados',
          histClientsTitle: 'Clientes / oportunidades',
          histClientsTotal: 'Clientes mapeados',
          histClientsOpportunity: 'Oportunidades',
          histClientsAlert: 'Em alerta',
          histClientsAttention: 'Em atencao',
          histNoClientsTitle: 'Sem oportunidades',
          histNoClientsText: 'Aguardando leitura historica de clientes.',
          histClientDaysNoCall: 'Dias sem chamado',
          histClientRecurrence: 'Recorrencia',
          histClientRecommendation: 'Recomendacao',
          histTechniciansTitle: 'Tecnicos / desempenho',
          histTechTotal: 'Tecnicos avaliados',
          histTechAvgScore: 'Score medio',
          histTechLowConfidence: 'Baixa confianca',
          histTechTop: 'Top desempenho',
          histTechColTech: 'Tecnico',
          histTechColScore: 'Score',
          histTechColReturn: '% retorno',
          histTechColAction: 'Acao recomendada',
          histNoTechTitle: 'Sem ranking tecnico',
          histNoTechText: 'Aguardando base historica de tecnicos.',
          histComparativesTitle: 'Comparativos historicos',
          histNoComparativesTitle: 'Sem comparativos',
          histNoComparativesText: 'Aguardando base historica para comparar periodos.',
          histComparativeMonth: 'Mes vs ano anterior',
          histComparativeQuarter: 'Trimestre vs ano anterior',
          histComparativeYtd: 'YTD vs ano anterior',
          histComparativeDelta: 'Delta',
          histLaudoTitle: 'Conformidade do laudo tecnico',
          histLaudoScore: 'Score de conformidade',
          histLaudoLevel: 'Nivel',
          histLaudoMissingAction: 'Sem acao',
          histLaudoMissingConclusion: 'Sem conclusao',
          histNoLaudoTitle: 'Sem leitura de conformidade',
          histNoLaudoText: 'Aguardando analise de laudos neste periodo.',
          histLaudoRule: 'Regra de ouro',
          histLaudoRecommendation: 'Recomendacao'
        };
  }

  function setTaxonomyStaticTexts(locale) {
    const t = getTaxonomyTexts(locale);
    setText('gmFilterTitle', t.filterTitle);
    setText('gmFilterHint', t.filterHint);
    setText('gmFilterPeriodLbl', t.filterPeriod);
    setText('gmFilterClientLbl', t.filterClient);
    setText('gmFilterCnpjLbl', t.filterCnpjAdvanced || t.filterCnpj || 'CNPJ');
    setText('gmFilterTechnicianLbl', t.filterTechnician);
    setText('gmFilterServiceLbl', t.filterServiceType);
    setText('gmFilterWarrantyLbl', t.filterWarranty);
    setText('gmFilterRetornoLbl', t.filterRetorno);
    setText('gmFilterEquipmentLbl', t.filterEquipment);
    setText('gmFilterCriticityLbl', t.filterCriticity);
    setText('gmApplyFiltersBtn', t.filterApply);
    setText('gmClearFiltersBtn', t.filterClear);
    setText('gmOpenFiltersBtnText', t.filterOpenBtn);
    setText('gmFilterStatus', t.filterStatusNone);
    FILTER_AXIS_KEYS.map((axisKey) => FILTER_AXIS_META[axisKey].searchId).forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.placeholder = t.filterSearchPlaceholder || 'Buscar...';
    });
    document.querySelectorAll('.gm-filter-group-action[data-filter-action="all"]').forEach((btn) => {
      btn.textContent = t.filterSelectAll || 'Selecionar todos';
    });
    document.querySelectorAll('.gm-filter-group-action[data-filter-action="clear"]').forEach((btn) => {
      btn.textContent = t.filterClearSelection || 'Limpar';
    });
    setText('gmPanelSummaryTitle', t.panelSummaryTitle);
    setText('gmPanelSummaryHint', t.panelSummaryHint);
    setText('gmNavModulePainel', t.modulePainel);
    setText('gmNavModuleOperacao', t.moduleOperacao);
    setText('gmNavModuleAnalise', t.moduleAnalise);
    setText('gmNavModuleTecnicos', t.moduleTecnicos);
    setText('gmNavModuleClientes', t.moduleClientes);
    setText('gmNavModuleComparativos', t.moduleComparativos);
    setText('gmNavModuleLaudo', t.moduleLaudo);
    setText('gmNavModuleGovernanca', t.moduleGovernanca);
    setText('gmMobileModulePainel', t.modulePainel);
    setText('gmMobileModuleOperacao', t.moduleOperacao);
    setText('gmMobileModuleAnalise', t.moduleAnalise);
    setText('gmMobileModuleTecnicos', t.moduleTecnicos);
    setText('gmMobileModuleClientes', t.moduleClientes);
    setText('gmMobileModuleComparativos', t.moduleComparativos);
    setText('gmMobileModuleLaudo', t.moduleLaudo);
    setText('gmMobileModuleGovernanca', t.moduleGovernanca);
    setText('gmViewModeLbl', t.viewModeLabel);
    setText('gmViewExecutiveBtn', t.viewModeExecutive);
    setText('gmViewTechnicalBtn', t.viewModeTechnical);
    setText('gmTaxonomyKicker', t.kicker);
    setText('gmTaxonomyTitle', t.title);
    setText('gmTabBtnInterna', t.tabInternal);
    setText('gmTabBtnExterna', t.tabExternal);
    setText('gmTabBtnTrimestral', t.tabQuarterly);
    setText('gmTaxPriorityLblSeverity', t.prioritySeverity);
    setText('gmTaxPriorityLblRisk', t.priorityRisk);
    setText('gmTaxPriorityLblAction', t.priorityAction);
    setText('gmTaxLblTotalOs', t.osAnalyzed);
    setText('gmTaxSubTotalOs', t.taxBase);
    setText('gmTaxLblTopService', t.dominantService);
    setText('gmTaxLblCoverage', t.coverage);
    setText('gmTaxLblQuality', t.quality);
    setText('gmTaxServiceChartTitle', t.serviceChartTitle);
    setText('gmTaxServiceChartHint', t.chartTop5);
    setText('gmTaxEqTitle', t.eqTitle);
    setText('gmTaxEqColItem', t.eqColItem);
    setText('gmTaxEqColVolume', t.eqColVolume);
    setText('gmTaxEqColCause', t.eqColCause);
    setText('gmTaxEqColOutcome', t.eqColOutcome);
    setText('gmTaxTechTitle', t.techTitle);
    setText('gmTaxTechColItem', t.techColItem);
    setText('gmTaxTechColVolume', t.techColVolume);
    setText('gmTaxTechColService', t.techColService);
    setText('gmTaxTechColOutcome', t.techColOutcome);
    setText('gmTaxParetoTitle', t.paretoTitle);
    setText('gmTaxParetoHint', t.chartTop6);
    setText('gmTaxAlertTitle', t.alertTitle);
    setText('gmTaxNarrativeTitle', t.extNarrative);
    setText('gmTaxFindingsTitle', t.extFindings);
    setText('gmTaxRecommendationsTitle', t.extRecommendations);
    setText('gmTaxReviewTitle', t.extReviewTitle);
    setText('gmTaxReviewSummaryTitle', t.extReviewSummaryTitle);
    setText('gmTaxReviewQueueTitle', t.extReviewQueueTitle);
    setText('gmTaxReviewLblPriority', t.reviewPriorityLabel);
    setText('gmTaxReviewLblReviewer', t.reviewReviewerLabel);
    setText('gmTaxReviewLblStatus', t.reviewStatusLabel);
    setText('gmTaxReviewLblDueAt', t.reviewDueAtLabel);
    setText('gmTaxReviewLblTotal', t.reviewTotalLabel);
    setText('gmTaxReviewLblOpen', t.reviewOpenLabel);
    setText('gmTaxReviewLblOverdue', t.reviewOverdueLabel);
    setText('gmTaxReviewLblByStatus', t.reviewByStatusLabel);
    setText('gmTaxReviewLblHighestPriority', t.reviewHighestPriorityLabel);
    setText('gmTaxReviewLblNextDueAt', t.reviewNextDueAtLabel);
    setText('gmHistClientsTitle', t.histClientsTitle);
    setText('gmHistClientsLblTotal', t.histClientsTotal);
    setText('gmHistClientsLblOpportunity', t.histClientsOpportunity);
    setText('gmHistClientsLblAlert', t.histClientsAlert);
    setText('gmHistClientsLblAttention', t.histClientsAttention);
    setText('gmHistTechniciansTitle', t.histTechniciansTitle);
    setText('gmHistTechLblTotal', t.histTechTotal);
    setText('gmHistTechLblScore', t.histTechAvgScore);
    setText('gmHistTechLblLowConf', t.histTechLowConfidence);
    setText('gmHistTechLblTop', t.histTechTop);
    setText('gmHistTechLblMissing', t.histTechMissing || (locale === 'en-US' ? 'Unidentified technician' : 'Sem técnico identificado'));
    setText('gmHistTechPeriodLbl', t.histTechPeriodLbl || (locale === 'en-US' ? 'Period' : 'Período'));
    setText('gmHistTechColTech', t.histTechColTech);
    setText('gmHistTechColScore', t.histTechColScore);
    setText('gmHistTechColReturn', t.histTechColReturn);
    setText('gmHistTechColAction', t.histTechColAction);
    setText('gmHistComparativesTitle', t.histComparativesTitle);
    setText('gmHistLaudoTitle', t.histLaudoTitle);
    setText('gmHistLaudoLblScore', t.histLaudoScore);
    setText('gmHistLaudoLblLevel', t.histLaudoLevel);
    setText('gmHistLaudoLblMissingAction', t.histLaudoMissingAction);
    setText('gmHistLaudoLblMissingConclusion', t.histLaudoMissingConclusion);
    setText('gmTaxQualityTitle', t.extQuality);
    setText('gmTaxQLblLevel', t.level);
    setText('gmTaxQLblConfidence', t.avgConfidence);
    setText('gmTaxQLblCoverage', t.coverageShort);
    setText('gmTaxQLblUnknown', t.unknownUndefined);
    setText('gmQuarterlySelectLabel', t.quarterlySelectLabel);
    setText('gmQuarterlyDownloadPdf', t.quarterlyDownloadPdf);
    setText('gmQuarterlyDownloadExcel', t.quarterlyDownloadExcel);
    setText('gmQuarterlyDownloadJson', t.quarterlyDownloadJson);
    setText('gmQuarterlyHeroTitle', t.quarterlyHeroTitle);
    setText('gmQuarterlyHeroSummary', t.quarterlyHeroSummary);
    setText('gmQuarterlyBadgePartial', t.quarterlyPartialBadge.replace('{monthsWithData}', '0'));
    setText('gmQuarterlyBadgeQualityLow', t.quarterlyQualityLowBadge);
    setText('gmQuarterlyLblQuarter', t.quarterlyLblQuarter);
    setText('gmQuarterlyLblTotalOs', t.quarterlyLblTotalOs);
    setText('gmQuarterlyLblSampleDays', t.quarterlyLblSampleDays);
    setText('gmQuarterlyLblOpenQueue', t.quarterlyLblOpenQueue);
    setText('gmQuarterlyOverviewTitle', t.quarterlyOverviewTitle);
    setText('gmQuarterlyQualityTitle', t.quarterlyQualityTitle);
    setText('gmQuarterlyQLblLevel', t.level);
    setText('gmQuarterlyQLblConfidence', t.avgConfidence);
    setText('gmQuarterlyQLblCoverage', t.coverageShort);
    setText('gmQuarterlyQLblUnknown', t.unknownUndefined);
    setText('gmQuarterlyMixTitle', t.quarterlyMixTitle);
    setText('gmQuarterlyReviewTitle', t.quarterlyReviewTitle);
    setText('gmQuarterlyEqTitle', t.quarterlyEqTitle);
    setText('gmQuarterlyEqColItem', t.quarterlyEqColItem);
    setText('gmQuarterlyEqColVolume', t.quarterlyEqColVolume);
    setText('gmQuarterlyEqColCause', t.quarterlyEqColCause);
    setText('gmQuarterlyEqColOutcome', t.quarterlyEqColOutcome);
    setText('gmQuarterlyNarrativeTitle', t.quarterlyNarrativeTitle);
    setText('gmQuarterlyNarrativeSummary', t.quarterlyNoNarrative);

    setText('gmCockpitTitle', t.cockpitTitle);
    setText('gmPriorityCardTitle', t.priorityCardTitle);
    setText('gmLblTopAlert', locale === 'en-US' ? 'Operational risk of the day' : 'Risco operacional do dia');
    setText('gmLblAction24h', locale === 'en-US' ? 'Action in 24h' : 'Ação em 24h');
    setText('gmLblTicketsLate', t.priorityTicketsLate);
    setText('gmLblPendAdm', locale === 'en-US' ? 'Administrative pending items' : 'Pendências administrativas');
    setText('gmLblMixAtendimento', t.priorityServiceMix);
    setText('gmLblMixGarantia', t.priorityWarrantyMix);
    setText('gmLblProdutoTop', t.priorityTopEquipment);
  }

  function updateFilterControlsFromPayload(payload, locale, t) {
    const available = (payload?.filters?.available && typeof payload.filters.available === 'object')
      ? payload.filters.available
      : {};
    filterOptionsCache = available;
    try {
      window.__gmLastFilterAvailable = available;
      window.__gmLastFilterAvailableAt = new Date().toISOString();
    } catch (_) {}
    const selected = ensureAppliedInsightsFilters();
    const periodSelect = document.getElementById('gmFilterPeriod');
    if (periodSelect) {
      periodSelect.innerHTML = (Array.isArray(available.period) && available.period.length
        ? available.period
        : [
            { key: 'monthly', label: locale === 'en-US' ? 'Monthly' : 'Mensal' },
            { key: 'daily', label: locale === 'en-US' ? 'Daily' : 'Diario' },
            { key: 'quarterly', label: locale === 'en-US' ? 'Quarterly' : 'Trimestral' },
            { key: 'historical', label: locale === 'en-US' ? 'Full history' : 'Historico completo' }
          ]
      ).map((itemLike) => {
        const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
        const key = String(item.key || '').trim();
        const label = String(item.label || key).trim();
        if (!key || !label) return '';
        const selectedAttr = selected.period === key ? ' selected' : '';
        return `<option value="${escapeHtml(key)}"${selectedAttr}>${escapeHtml(label)}</option>`;
      }).filter(Boolean).join('');
      if (!periodSelect.value) periodSelect.value = selected.period || 'monthly';
    }
    FILTER_AXIS_KEYS.forEach((axisKey) => {
      renderSearchableFilterChecklist(axisKey, available[axisKey], selected[axisKey], t.filterNoOptions);
    });
  }

  function rerenderSearchableFilterChecklists(locale, t) {
    const selected = collectInsightsFiltersFromUI();
    const available = (filterOptionsCache && typeof filterOptionsCache === 'object') ? filterOptionsCache : {};
    FILTER_AXIS_KEYS.forEach((axisKey) => {
      renderSearchableFilterChecklist(axisKey, available[axisKey], selected[axisKey], t.filterNoOptions);
    });
  }

  function renderLocalFilterPreview(filtersLike) {
    const locale = getLanguageTag();
    const t = getTaxonomyTexts(locale);
    const applied = normalizeInsightsFilters(filtersLike || collectInsightsFiltersFromUI());
    const payloadPreview = {
      filters: {
        active: activeFilterCount(applied) > 0,
        applied,
        available: filterOptionsCache
      }
    };
    renderFilterStatus(payloadPreview, t);
    renderActiveFilterChips(payloadPreview, t);
  }

  function applyFilterAxisAction(axisLike, actionLike) {
    const axis = String(axisLike || '').trim();
    const action = String(actionLike || '').trim().toLowerCase();
    const meta = FILTER_AXIS_META[axis];
    if (!meta) return;
    if (action !== 'all' && action !== 'clear') return;
    const available = (filterOptionsCache && typeof filterOptionsCache === 'object') ? filterOptionsCache : {};
    const options = Array.isArray(available[axis]) ? available[axis] : [];
    const filtered = resolveChecklistFilteredOptions(axis, options);
    if (!filtered.length && action === 'all') return;
    const selectedSet = new Set(getSelectedValuesByAxis(axis));
    filtered.forEach((itemLike) => {
      const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
      const key = String(item.key || '').trim();
      if (!key) return;
      if (action === 'all') selectedSet.add(key);
      else selectedSet.delete(key);
    });
    const nextValues = Array.from(selectedSet);
    setSelectedValuesToChecklist(meta.containerId, nextValues);
    renderSearchableFilterChecklist(axis, options, nextValues, getTaxonomyTexts(getLanguageTag()).filterNoOptions);
    queueAutoApplyFilters();
  }

  function queueAutoApplyFilters() {
    if (filterAutoApplyTimer) clearTimeout(filterAutoApplyTimer);
    appliedInsightsFilters = collectInsightsFiltersFromUI();
    renderLocalFilterPreview(appliedInsightsFilters);
    filterAutoApplyTimer = setTimeout(() => {
      refreshGodMode().catch(() => {});
    }, 320);
  }

  function renderFilterStatus(payload, t) {
    const backendFilters = (payload?.filters && typeof payload.filters === 'object') ? payload.filters : {};
    const localApplied = ensureAppliedInsightsFilters();
    const backendApplied = normalizeInsightsFilters((backendFilters && typeof backendFilters.applied === 'object') ? backendFilters.applied : {});
    const applied = activeFilterCount(backendApplied) > 0 ? backendApplied : localApplied;
    const activeCount = activeFilterCount(applied);
    const filteredCount = Math.max(0, Number(backendFilters?.daily?.totalOsFiltered || 0));
    const hasNoResult = (backendFilters.active === true || activeCount > 0) && filteredCount === 0;
    const statusLabel = hasNoResult
      ? (t.filterStatusNoResults || 'Nenhum resultado para os filtros aplicados')
      : ((backendFilters.active === true || activeCount > 0)
        ? t.filterStatusActive.replace('{count}', String(activeCount))
        : t.filterStatusNone);
    setText('gmFilterStatus', statusLabel);
  }

  function buildFilterLabelMap(optionListLike) {
    const map = new Map();
    const optionList = Array.isArray(optionListLike) ? optionListLike : [];
    optionList.forEach((itemLike) => {
      const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
      const key = String(item.key || '').trim();
      const label = String(item.label || key).trim();
      if (!key || !label) return;
      map.set(key, label);
    });
    return map;
  }

  function resolveFilterChipEntries(payload, t) {
    const localApplied = ensureAppliedInsightsFilters();
    const backendApplied = normalizeInsightsFilters((payload?.filters?.applied && typeof payload.filters.applied === 'object') ? payload.filters.applied : {});
    const applied = activeFilterCount(backendApplied) > 0 ? backendApplied : localApplied;
    const available = (payload?.filters?.available && typeof payload.filters.available === 'object')
      ? payload.filters.available
      : {};
    const periodMap = buildFilterLabelMap(
      Array.isArray(available.period) && available.period.length
        ? available.period
        : [
            { key: 'monthly', label: t.scopeMonthly },
            { key: 'daily', label: t.scopeDaily },
            { key: 'quarterly', label: t.tabQuarterly },
            { key: 'historical', label: t.scopeHistorical || 'Historico completo' }
          ]
    );
    const maps = {
      clients: buildFilterLabelMap(available.clients),
      cnpj: buildFilterLabelMap(available.cnpj),
      technicians: buildFilterLabelMap(available.technicians),
      serviceTypes: buildFilterLabelMap(available.serviceTypes),
      warranty: buildFilterLabelMap(available.warranty),
      retorno: buildFilterLabelMap(available.retorno),
      equipment: buildFilterLabelMap(available.equipment),
      criticity: buildFilterLabelMap(available.criticity)
    };
    const chips = [];
    if (applied.period && applied.period !== 'monthly') {
      chips.push({
        axis: t.filterPeriod,
        label: periodMap.get(applied.period) || applied.period
      });
    }
    const axisSpecs = [
      ['clients', t.filterClient],
      ['cnpj', t.filterCnpj || 'CNPJ'],
      ['technicians', t.filterTechnician],
      ['serviceTypes', t.filterServiceType],
      ['warranty', t.filterWarranty],
      ['retorno', t.filterRetorno],
      ['equipment', t.filterEquipment],
      ['criticity', t.filterCriticity]
    ];
    axisSpecs.forEach(([axisKey, axisLabel]) => {
      const values = Array.isArray(applied[axisKey]) ? applied[axisKey] : [];
      const labelMap = maps[axisKey] || new Map();
      values.forEach((value) => {
        chips.push({
          axis: axisLabel,
          label: labelMap.get(value) || value
        });
      });
    });
    return chips;
  }

  function renderActiveFilterChips(payload, t) {
    const chipsWrap = document.getElementById('gmFilterChips');
    const countEl = document.getElementById('gmFilterActiveCount');
    if (!chipsWrap) return;
    const chips = resolveFilterChipEntries(payload, t);
    const count = chips.length;
    if (countEl) {
      countEl.textContent = String(count);
      countEl.classList.toggle('is-active', count > 0);
    }
    if (!count) {
      chipsWrap.hidden = true;
      chipsWrap.innerHTML = '';
      return;
    }
    const chipsHtml = chips
      .map((chip) => `<span class="gm-filter-chip"><b>${escapeHtml(chip.axis)}</b>${escapeHtml(chip.label)}</span>`)
      .join('');
    chipsWrap.hidden = false;
    chipsWrap.innerHTML = `${chipsHtml}<button type="button" class="gm-filter-chip-clear" id="gmFilterChipsClearBtn">${escapeHtml(t.filterChipsClear)}</button>`;
    const clearBtn = document.getElementById('gmFilterChipsClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const empty = emptyInsightsFilters();
        applyInsightsFiltersToUI(empty);
        appliedInsightsFilters = cloneInsightsFilters(empty);
        refreshGodMode().catch(() => {});
      });
    }
  }

  function taxonomyValueLabel(axis, key, locale) {
    const tablePt = {
      quality: { high: 'Alta', medium: 'Media', low: 'Baixa' },
      serviceType: {
        preventiva: 'Preventiva',
        corretiva: 'Corretiva',
        instalacao: 'Instalacao',
        configuracao: 'Configuracao',
        treinamento: 'Treinamento',
        vistoria: 'Vistoria',
        suporte_ajuste: 'Suporte / Ajuste',
        retorno_tecnico: 'Retorno tecnico',
        nao_identificado: 'Nao identificado'
      },
      warrantyStatus: {
        em_garantia: 'Em garantia',
        fora_garantia: 'Fora de garantia',
        nao_identificado: 'Nao identificado'
      },
      warrantyType: {
        garantia_peca: 'Garantia de peca',
        garantia_servico_instalacao: 'Garantia servico/instalacao',
        garantia_fabrica: 'Garantia de fabrica',
        sem_garantia: 'Sem garantia',
        nao_identificado: 'Nao identificado'
      },
      probableCause: {
        equipamento: 'Equipamento',
        instalacao: 'Instalacao',
        infraestrutura_cliente: 'Infraestrutura cliente',
        software_configuracao: 'Software/configuracao',
        integracao: 'Integracao',
        operacao_uso: 'Operacao/uso',
        peca_acessorio: 'Peca/acessorio',
        indefinido: 'Indefinido'
      },
      outcomeType: {
        resolvido: 'Resolvido',
        paliativo: 'Paliativo',
        requer_peca: 'Requer peca',
        requer_fabrica: 'Requer fabrica',
        requer_cliente: 'Requer cliente',
        requer_nova_visita: 'Requer nova visita',
        indefinido: 'Indefinido'
      }
    };
    const tableEn = {
      quality: { high: 'High', medium: 'Medium', low: 'Low' },
      serviceType: {
        preventiva: 'Preventive',
        corretiva: 'Corrective',
        instalacao: 'Installation',
        configuracao: 'Configuration',
        treinamento: 'Training',
        vistoria: 'Inspection',
        suporte_ajuste: 'Support / Adjustment',
        retorno_tecnico: 'Technical return',
        nao_identificado: 'Not identified'
      },
      warrantyStatus: {
        em_garantia: 'In warranty',
        fora_garantia: 'Out of warranty',
        nao_identificado: 'Not identified'
      },
      warrantyType: {
        garantia_peca: 'Part warranty',
        garantia_servico_instalacao: 'Service/installation warranty',
        garantia_fabrica: 'Factory warranty',
        sem_garantia: 'No warranty',
        nao_identificado: 'Not identified'
      },
      probableCause: {
        equipamento: 'Equipment',
        instalacao: 'Installation',
        infraestrutura_cliente: 'Customer infrastructure',
        software_configuracao: 'Software/configuration',
        integracao: 'Integration',
        operacao_uso: 'Operation/usage',
        peca_acessorio: 'Part/accessory',
        indefinido: 'Undefined'
      },
      outcomeType: {
        resolvido: 'Resolved',
        paliativo: 'Palliative',
        requer_peca: 'Requires part',
        requer_fabrica: 'Requires factory',
        requer_cliente: 'Requires customer',
        requer_nova_visita: 'Requires new visit',
        indefinido: 'Undefined'
      }
    };
    const table = locale === 'en-US' ? tableEn : tablePt;
    const byAxis = table[axis] || {};
    if (byAxis[key]) return byAxis[key];
    return String(key || '--').replace(/_/g, ' ');
  }

  function getFirstDistributionEntry(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return null;
    return rows[0] || null;
  }

  function equipmentRiskLabel(key, locale) {
    const value = String(key || '').toLowerCase();
    const isEn = locale === 'en-US';
    if (value === 'critical') return isEn ? 'Critical' : 'Critico';
    if (value === 'high') return isEn ? 'High' : 'Alto';
    if (value === 'medium') return isEn ? 'Medium' : 'Medio';
    if (value === 'low') return isEn ? 'Low' : 'Baixo';
    return isEn ? 'Not identified' : 'Nao identificado';
  }

  function equipmentSolutionTypeLabel(key, locale) {
    const value = String(key || '').toLowerCase();
    const isEn = locale === 'en-US';
    const pt = {
      troca_peca: 'Troca de peca',
      atualizacao: 'Atualizacao',
      configuracao: 'Configuracao',
      mau_uso: 'Mau uso',
      erro_procedimento: 'Erro de procedimento',
      infraestrutura_cliente: 'Infra cliente',
      orientacao: 'Orientacao',
      sem_solucao_definida: 'Sem solucao definida',
      nao_identificado: 'Nao identificado'
    };
    const en = {
      troca_peca: 'Part replacement',
      atualizacao: 'Update',
      configuracao: 'Configuration',
      mau_uso: 'Misuse',
      erro_procedimento: 'Procedure error',
      infraestrutura_cliente: 'Customer infra',
      orientacao: 'Guidance',
      sem_solucao_definida: 'No defined solution',
      nao_identificado: 'Not identified'
    };
    return (isEn ? en : pt)[value] || String(key || '--').replace(/_/g, ' ');
  }

  function equipmentAnalysisQualityLabel(key, locale) {
    const value = String(key || '').toLowerCase();
    const isEn = locale === 'en-US';
    if (value === 'alta' || value === 'high') return isEn ? 'High' : 'Alta';
    if (value === 'media' || value === 'medium') return isEn ? 'Medium' : 'Media';
    if (value === 'baixa' || value === 'low') return isEn ? 'Low' : 'Baixa';
    return isEn ? 'Low' : 'Baixa';
  }

  function equipmentFallbackText(locale, kind) {
    const isEn = locale === 'en-US';
    if (kind === 'insufficient') return isEn ? 'Insufficient data' : 'Sem dados suficientes';
    if (kind === 'waiting') return isEn ? 'Awaiting operational baseline' : 'Aguardando base operacional';
    return isEn ? 'Not identified' : 'Não identificado';
  }

  function equipmentSafeText(valueLike, locale, kind) {
    if (valueLike == null) return equipmentFallbackText(locale, kind);
    if (typeof valueLike === 'string' || typeof valueLike === 'number' || typeof valueLike === 'boolean') {
      const text = String(valueLike).trim();
      if (!text || text === '--' || /^undefined|null$/i.test(text) || text === '[object Object]') {
        return equipmentFallbackText(locale, kind);
      }
      return text;
    }
    if (typeof valueLike === 'object') {
      const text = String(valueLike.label || valueLike.name || valueLike.title || valueLike.key || '').trim();
      return text && text !== '[object Object]' ? text : equipmentFallbackText(locale, kind);
    }
    return equipmentFallbackText(locale, kind);
  }

  function equipmentSafeNumber(valueLike, fallback) {
    const value = Number(valueLike);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function normalizeTextForFilter(valueLike) {
    return String(valueLike || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function isEquipmentUnidentifiedName(valueLike) {
    const value = normalizeTextForFilter(valueLike || '');
    return !value
      || value.includes('nao identificado')
      || value.includes('não identificado')
      || value.includes('not identified')
      || value === '--';
  }

  function getEquipmentRowIntel(row, locale) {
    const topService = getFirstDistributionEntry(row?.serviceType);
    const topCause = getFirstDistributionEntry(row?.probableCause);
    const topOutcome = getFirstDistributionEntry(row?.outcomeType);
    const count = equipmentSafeNumber(row?.totalOs || row?.volume, 0);
    const percent = equipmentSafeNumber(row?.percentOfPeriod != null ? row.percentOfPeriod : row?.sharePct, 0);
    const evidence = Array.isArray(row?.evidence)
      ? row.evidence.map((line) => equipmentSafeText(line, locale, 'insufficient')).filter(Boolean)
      : [];
    return {
      equipmentName: equipmentSafeText(row?.equipmentName || row?.equipment, locale, 'unknown'),
      totalOs: count,
      percentOfPeriod: percent,
      dominantOpeningReason: equipmentSafeText(row?.dominantOpeningReason || taxonomyValueLabel('serviceType', topService?.key || 'nao_identificado', locale), locale, 'unknown'),
      dominantProbableCause: equipmentSafeText(row?.dominantProbableCause || taxonomyValueLabel('probableCause', topCause?.key || 'indefinido', locale), locale, 'unknown'),
      dominantSolution: equipmentSafeText(row?.dominantSolution || taxonomyValueLabel('outcomeType', topOutcome?.key || 'indefinido', locale), locale, 'insufficient'),
      solutionType: equipmentSafeText(row?.solutionType || 'nao_identificado', locale, 'unknown'),
      riskLevel: equipmentSafeText(row?.riskLevel || 'low', locale, 'unknown').toLowerCase(),
      confidencePct: equipmentSafeNumber(row?.confidencePct != null ? row.confidencePct : row?.confidenceAvgPct, 0),
      analysisQuality: String(row?.analysisQuality || '').trim().toLowerCase() || 'baixa',
      evidence,
      recommendedAction: equipmentSafeText(row?.recommendedAction, locale, 'waiting')
    };
  }

  function classificationReviewStorageKey(periodLike) {
    const period = String(periodLike || 'current').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'current';
    return `gm_classification_review_v1_${period}`;
  }

  function readClassificationReviewStore(periodLike) {
    try {
      const parsed = JSON.parse(localStorage.getItem(classificationReviewStorageKey(periodLike)) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeClassificationReviewStore(periodLike, storeLike) {
    try {
      localStorage.setItem(classificationReviewStorageKey(periodLike), JSON.stringify(storeLike || {}));
    } catch (_) {}
  }

  function buildClassificationReviewCases(detailedLike, rowsLike, locale) {
    const detailed = (detailedLike && typeof detailedLike === 'object') ? detailedLike : {};
    const period = detailed?.period?.label || detailed?.period?.referenceDate || '';
    const rows = Array.isArray(rowsLike) ? rowsLike : [];
    const cases = [];
    rows.forEach((row) => {
      const intel = getEquipmentRowIntel(row, locale);
      const causeEntry = getFirstDistributionEntry(row?.probableCause);
      const outcomeEntry = getFirstDistributionEntry(row?.outcomeType);
      const causeKey = String(causeEntry?.key || '').toLowerCase();
      const rowConfidence = equipmentSafeNumber(intel.confidencePct, 0);
      const rowNeedsReview = String(intel.analysisQuality || '').toLowerCase() === 'baixa'
        || rowConfidence < 55
        || (causeKey === 'equipamento' && rowConfidence < 70);
      const samples = Array.isArray(row?.evidenceSamples) ? row.evidenceSamples : [];
      samples.forEach((sample, index) => {
        const sampleConfidence = equipmentSafeNumber(sample?.confidencePct, rowConfidence);
        const sampleCause = String(sample?.cause || causeEntry?.key || '').toLowerCase();
        const sampleNeedsReview = sampleConfidence < 55
          || String(intel.analysisQuality || '').toLowerCase() === 'baixa'
          || (sampleCause === 'equipamento' && sampleConfidence < 70);
        if (!sampleNeedsReview && !rowNeedsReview) return;
        const os = equipmentSafeText(sample?.os || `amostra_${index + 1}`, locale, 'unknown');
        const id = `${period || 'periodo'}__${os}__${normalizeTextForFilter(intel.equipmentName).slice(0, 36)}`;
        cases.push({
          id,
          os,
          cliente: equipmentSafeText(sample?.cliente, locale, 'unknown'),
          equipmentName: intel.equipmentName,
          causeKey: sample?.cause || causeEntry?.key || 'indefinido',
          causeLabel: taxonomyValueLabel('probableCause', sample?.cause || causeEntry?.key || 'indefinido', locale),
          outcomeKey: sample?.outcome || outcomeEntry?.key || 'indefinido',
          outcomeLabel: taxonomyValueLabel('outcomeType', sample?.outcome || outcomeEntry?.key || 'indefinido', locale),
          serviceType: taxonomyValueLabel('serviceType', sample?.serviceType || getFirstDistributionEntry(row?.serviceType)?.key || 'nao_identificado', locale),
          confidencePct: sampleConfidence,
          evidence: equipmentSafeText(sample?.text || (Array.isArray(intel.evidence) ? intel.evidence[0] : ''), locale, 'insufficient'),
          source: equipmentSafeText(sample?.source || 'classification', locale, 'unknown'),
          reason: sampleConfidence < 55
            ? 'Baixa confiança'
            : (sampleCause === 'equipamento' ? 'Causa genérica com confiança moderada' : 'Qualidade baixa do grupo')
        });
      });
      if (!samples.length && rowNeedsReview) {
        const id = `${period || 'periodo'}__equipamento__${normalizeTextForFilter(intel.equipmentName).slice(0, 48)}`;
        cases.push({
          id,
          os: 'Grupo',
          cliente: 'Consolidado',
          equipmentName: intel.equipmentName,
          causeKey: causeEntry?.key || 'indefinido',
          causeLabel: intel.dominantProbableCause,
          outcomeKey: outcomeEntry?.key || 'indefinido',
          outcomeLabel: intel.dominantSolution,
          serviceType: intel.dominantOpeningReason,
          confidencePct: rowConfidence,
          evidence: Array.isArray(intel.evidence) && intel.evidence.length ? intel.evidence[0] : equipmentFallbackText(locale, 'insufficient'),
          source: 'grupo_equipamento',
          reason: 'Equipamento com baixa qualidade de análise'
        });
      }
    });
    const seen = new Set();
    return cases
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => a.confidencePct - b.confidencePct || String(a.equipmentName).localeCompare(String(b.equipmentName)))
      .slice(0, 30);
  }

  function classificationReviewStatusLabel(statusLike) {
    const status = String(statusLike || '').toLowerCase();
    if (status === 'validado') return 'Validada';
    if (status === 'reclassificar_causa') return 'Causa ajustada';
    if (status === 'reclassificar_solucao') return 'Solução ajustada';
    if (status === 'analise_manual') return 'Análise manual';
    return 'Pendente';
  }

  function setClassificationReviewAction(periodLike, caseId, action) {
    const store = readClassificationReviewStore(periodLike);
    const current = (store[caseId] && typeof store[caseId] === 'object') ? store[caseId] : {};
    let note = '';
    if (action === 'reclassificar_causa') {
      note = window.prompt('Nova causa sugerida:', current.note || '') || '';
    } else if (action === 'reclassificar_solucao') {
      note = window.prompt('Nova solução sugerida:', current.note || '') || '';
    } else if (action === 'analise_manual') {
      note = window.prompt('Motivo da análise manual:', current.note || '') || '';
    }
    store[caseId] = {
      status: action,
      note,
      updatedAt: new Date().toISOString()
    };
    writeClassificationReviewStore(periodLike, store);
    renderTaxonomy(lastInsightsPayload || {});
  }

  function bindClassificationReviewActions(periodLike) {
    document.querySelectorAll('[data-class-review-action]').forEach((btn) => {
      if (btn.dataset.boundReviewAction === '1') return;
      btn.dataset.boundReviewAction = '1';
      btn.addEventListener('click', () => {
        setClassificationReviewAction(periodLike, btn.dataset.caseId || '', btn.dataset.classReviewAction || '');
      });
    });
  }

  function renderClassificationReview(detailedLike, rowsLike, locale) {
    const summaryBox = document.getElementById('gmClassificationReviewSummary');
    const listBox = document.getElementById('gmClassificationReviewList');
    const pctBox = document.getElementById('gmClassificationReviewPct');
    if (!summaryBox || !listBox) return;
    const detailed = (detailedLike && typeof detailedLike === 'object') ? detailedLike : {};
    const period = detailed?.period?.label
      || detailed?.period?.referenceDate
      || document.getElementById('currentDateInput')?.value
      || 'current';
    const rows = Array.isArray(rowsLike) ? rowsLike : [];
    const qualityCounts = rows.reduce((acc, row) => {
      const q = String(row?.analysisQuality || '').toLowerCase();
      if (q === 'alta') acc.alta += 1;
      else if (q === 'media') acc.media += 1;
      else acc.baixa += 1;
      return acc;
    }, { baixa: 0, media: 0, alta: 0 });
    const cases = buildClassificationReviewCases(detailed, rows, locale);
    const store = readClassificationReviewStore(period);
    const reviewedCount = cases.filter((item) => store[item.id]?.status).length;
    const reviewedPct = cases.length ? Math.round((reviewedCount * 10000) / cases.length) / 100 : 0;
    if (pctBox) pctBox.textContent = `${formatPct(reviewedPct, locale, 0)} revisado`;
    summaryBox.innerHTML = [
      { label: 'Baixa confiança', value: cases.length, hint: 'Itens na fila local' },
      { label: 'Qualidade baixa', value: qualityCounts.baixa, hint: 'Equipamentos' },
      { label: 'Qualidade média', value: qualityCounts.media, hint: 'Equipamentos' },
      { label: 'Qualidade alta', value: qualityCounts.alta, hint: 'Equipamentos' },
      { label: 'Revisados', value: reviewedCount, hint: `${formatPct(reviewedPct, locale, 0)} da fila` }
    ].map((item) => (
      `<div class="gm-equipment-intel-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(String(item.value))}</strong><em>${escapeHtml(item.hint)}</em></div>`
    )).join('');
    if (!cases.length) {
      listBox.innerHTML = '<div class="gm-equipment-intel-empty">Sem casos de baixa confiança para revisão nesta base.</div>';
      return;
    }
    listBox.innerHTML = cases.map((item) => {
      const saved = store[item.id] || {};
      const status = String(saved.status || 'pendente');
      const note = saved.note ? `<p class="gm-classification-review-note">Ajuste local: ${escapeHtml(saved.note)}</p>` : '';
      return `<article class="gm-classification-review-item ${status !== 'pendente' ? 'is-reviewed' : ''}">`
        + '<div class="gm-classification-review-item-head">'
        + `<strong>OS ${escapeHtml(item.os)}</strong>`
        + `<span>${escapeHtml(classificationReviewStatusLabel(status))}</span>`
        + '</div>'
        + '<div class="gm-classification-review-grid">'
        + `<span><b>Cliente</b>${escapeHtml(item.cliente)}</span>`
        + `<span><b>Equipamento</b>${escapeHtml(item.equipmentName)}</span>`
        + `<span><b>Causa inferida</b>${escapeHtml(item.causeLabel)}</span>`
        + `<span><b>Solução inferida</b>${escapeHtml(item.outcomeLabel)}</span>`
        + `<span><b>Tipo inferido</b>${escapeHtml(item.serviceType)}</span>`
        + `<span><b>Confiança</b>${escapeHtml(formatPct(item.confidencePct, locale, 0))}</span>`
        + '</div>'
        + `<p><b>Evidência</b> ${escapeHtml(item.evidence)}</p>`
        + `<p class="gm-classification-review-source">Origem: ${escapeHtml(item.source)} | ${escapeHtml(item.reason)}</p>`
        + note
        + '<div class="gm-classification-review-actions">'
        + `<button type="button" data-case-id="${escapeHtml(item.id)}" data-class-review-action="validado">Validar classificação</button>`
        + `<button type="button" data-case-id="${escapeHtml(item.id)}" data-class-review-action="reclassificar_causa">Reclassificar causa</button>`
        + `<button type="button" data-case-id="${escapeHtml(item.id)}" data-class-review-action="reclassificar_solucao">Reclassificar solução</button>`
        + `<button type="button" data-case-id="${escapeHtml(item.id)}" data-class-review-action="analise_manual">Precisa análise manual</button>`
        + '</div>'
        + '</article>';
    }).join('');
    bindClassificationReviewActions(period);
  }

  function readEquipmentIntelFilters() {
    return {
      text: String(document.getElementById('gmEquipmentFilterText')?.value || '').trim().toLowerCase(),
      risk: String(document.getElementById('gmEquipmentFilterRisk')?.value || '').trim().toLowerCase(),
      quality: String(document.getElementById('gmEquipmentFilterQuality')?.value || '').trim().toLowerCase(),
      type: String(document.getElementById('gmEquipmentFilterType')?.value || '').trim().toLowerCase()
    };
  }

  function bindEquipmentIntelControls() {
    ['gmEquipmentFilterText', 'gmEquipmentFilterRisk', 'gmEquipmentFilterQuality', 'gmEquipmentFilterType'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.gmBound === '1') return;
      el.dataset.gmBound = '1';
      el.addEventListener('input', () => {
        equipmentIntelExpanded = false;
        renderTaxonomy(lastInsightsPayload || {});
      });
      el.addEventListener('change', () => {
        equipmentIntelExpanded = false;
        renderTaxonomy(lastInsightsPayload || {});
      });
    });
  }

  function buildEquipmentIntelMetrics(detailedLike, rowsLike, locale) {
    const detailed = (detailedLike && typeof detailedLike === 'object') ? detailedLike : {};
    const base = (detailed.base && typeof detailed.base === 'object') ? detailed.base : {};
    const coverage = (detailed.auditCoverage && typeof detailed.auditCoverage === 'object') ? detailed.auditCoverage : {};
    const summary = (detailed.taxonomySummary && typeof detailed.taxonomySummary === 'object') ? detailed.taxonomySummary : {};
    const rows = Array.isArray(rowsLike) ? rowsLike : [];
    const totalOs = equipmentSafeNumber(
      coverage.totalInputItems || coverage.totalAnalyzedItems || base.totalOs || base.analyzedItems || summary.totalOs,
      0
    );
    const missingEquipment = equipmentSafeNumber(base.missingEquipmentCount, 0);
    const identifiedRows = rows.filter((row) => !isEquipmentUnidentifiedName(row?.equipment || row?.equipmentName));
    const identifiedOs = totalOs > 0
      ? Math.max(0, totalOs - missingEquipment)
      : identifiedRows.reduce((acc, row) => acc + equipmentSafeNumber(row?.totalOs, 0), 0);
    const equipmentCount = identifiedRows.length;
    const analyzedOs = equipmentSafeNumber(coverage.totalAnalyzedItems || base.analyzedItems || totalOs || identifiedOs, 0);
    const insufficientRows = rows.filter((row) => {
      const confidence = equipmentSafeNumber(row?.confidencePct != null ? row.confidencePct : row?.confidenceAvgPct, 0);
      const cause = getFirstDistributionEntry(row?.probableCause);
      const outcome = getFirstDistributionEntry(row?.outcomeType);
      return confidence > 0 && confidence < 45
        || String(cause?.key || '').toLowerCase() === 'indefinido'
        || String(outcome?.key || '').toLowerCase() === 'indefinido';
    });
    const insufficientOs = Math.max(0, insufficientRows.reduce((acc, row) => acc + equipmentSafeNumber(row?.totalOs, 0), 0) - missingEquipment);
    const confidenceValues = identifiedRows
      .map((row) => equipmentSafeNumber(row?.confidencePct != null ? row.confidencePct : row?.confidenceAvgPct, 0))
      .filter((value) => value > 0);
    const avgConfidence = confidenceValues.length
      ? confidenceValues.reduce((acc, value) => acc + value, 0) / confidenceValues.length
      : equipmentSafeNumber(summary.confidenceAvgPct, 0);
    const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const topRisk = identifiedRows
      .map((row) => getEquipmentRowIntel(row, locale))
      .sort((a, b) => (riskOrder[b.riskLevel] || 0) - (riskOrder[a.riskLevel] || 0) || b.totalOs - a.totalOs)[0] || null;
    const topEquipment = identifiedRows
      .map((row) => getEquipmentRowIntel(row, locale))
      .sort((a, b) => b.totalOs - a.totalOs)[0] || null;
    const qualityScores = identifiedRows.map((row) => {
      const quality = String(row?.analysisQuality || '').toLowerCase();
      if (quality === 'alta') return 3;
      if (quality === 'media') return 2;
      return 1;
    });
    const avgQualityScore = qualityScores.length
      ? qualityScores.reduce((acc, value) => acc + value, 0) / qualityScores.length
      : 1;
    const avgQuality = avgQualityScore >= 2.6 ? 'alta' : (avgQualityScore >= 1.8 ? 'media' : 'baixa');
    return {
      totalOs,
      analyzedOs,
      missingEquipment,
      insufficientOs,
      rawTotalOs: totalOs,
      ignoredItems: equipmentSafeNumber(coverage.ignoredItems, 0),
      equipmentCount,
      avgConfidence,
      topEquipment,
      avgQuality,
      topRisk
    };
  }

  function renderEquipmentIntelSummary(id, detailedLike, rowsLike, locale) {
    const box = document.getElementById(id);
    if (!box) return;
    const metrics = buildEquipmentIntelMetrics(detailedLike, rowsLike, locale);
    if (!metrics.totalOs) {
      box.innerHTML = '<div class="gm-equipment-intel-empty">' + escapeHtml(equipmentFallbackText(locale, 'waiting')) + '</div>';
      return;
    }
    const topRiskText = metrics.topRisk
      ? `${equipmentRiskLabel(metrics.topRisk.riskLevel, locale)} - ${metrics.topRisk.equipmentName}`
      : equipmentFallbackText(locale, 'unknown');
    box.innerHTML = [
      { label: 'Equipamento mais recorrente', value: metrics.topEquipment ? metrics.topEquipment.equipmentName : '--', hint: metrics.topEquipment ? `${metrics.topEquipment.totalOs} OS` : '--' },
      { label: 'Qualidade media', value: equipmentAnalysisQualityLabel(metrics.avgQuality, locale), hint: `${formatPct(metrics.avgConfidence, locale, 0)} de confianca` },
      { label: 'Equipamentos analisados', value: metrics.equipmentCount, hint: `${metrics.missingEquipment} sem equipamento identificado` },
      { label: 'OS analisadas', value: metrics.analyzedOs, hint: `${metrics.totalOs} OS no período` },
      { label: 'Maior risco', value: topRiskText, hint: metrics.insufficientOs ? `${metrics.insufficientOs} OS com dados insuficientes` : 'Base classificada' },
      { label: 'Confiança média', value: formatPct(metrics.avgConfidence, locale, 0), hint: 'Média por equipamento' }
    ].map((item) => (
      '<div class="gm-equipment-summary-card">'
      + '<span>' + escapeHtml(item.label) + '</span>'
      + '<strong>' + escapeHtml(String(item.value)) + '</strong>'
      + '<small>' + escapeHtml(item.hint) + '</small>'
      + '</div>'
    )).join('');
  }

  function renderEquipmentIntelListProgressive(rows, locale, emptyLabel) {
    const box = document.getElementById('gmEquipmentIntelList');
    if (box) {
      box.innerHTML = '<div class="gm-equipment-intel-empty">' + escapeHtml(locale === 'en-US' ? 'Loading equipment list...' : 'Carregando lista de equipamentos...') + '</div>';
    }
    const countBox = document.getElementById('gmEquipmentIntelCount');
    if (countBox) countBox.textContent = locale === 'en-US' ? 'Preparing equipment ranking...' : 'Preparando ranking de equipamentos...';
    window.setTimeout(() => {
      perfTime('[PERF][AI-TECH] render_lista_equipamentos');
      renderEquipmentIntelList('gmEquipmentIntelList', rows, locale, emptyLabel);
      perfTimeEnd('[PERF][AI-TECH] render_lista_equipamentos');
    }, 0);
  }

  function pickDetailedAnalytics(payload) {
    const daily = payload?.insights?.detailedAnalytics || payload?.insightsDetailed || null;
    const monthly = payload?.monthlyOs?.detailedAnalytics || null;
    const hasMonthly = Number(payload?.monthlyOs?.sampleDays || 0) > 0
      && Number(monthly?.taxonomySummary?.totalOs || 0) > 0;
    if (hasMonthly) {
      return {
        detailed: monthly,
        scope: 'monthly',
        period: payload?.monthlyOs?.month || monthly?.period?.label || ''
      };
    }
    return {
      detailed: daily,
      scope: 'daily',
      period: daily?.period?.label || payload?.date || payload?.insights?.date || ''
    };
  }

  function setTechnicalAnalysisLoadingState(messageLike) {
    const locale = getLanguageTag();
    const message = String(messageLike || (locale === 'en-US' ? 'Loading technical analysis...' : 'Carregando analise tecnica...'));
    setText('gmTaxonomyPeriod', locale === 'en-US' ? 'Period: loading' : 'Periodo: carregando');
    setText('gmTaxonomyScope', locale === 'en-US' ? 'Scope: loading' : 'Escopo: carregando');
    setText('gmTaxNarrativeSummary', message);
    const summary = document.getElementById('gmEquipmentIntelSummary');
    if (summary) summary.innerHTML = '<div class="gm-equipment-intel-empty">' + escapeHtml(message) + '</div>';
    const list = document.getElementById('gmEquipmentIntelList');
    if (list) list.innerHTML = '<div class="gm-equipment-intel-empty">' + escapeHtml(message) + '</div>';
    const count = document.getElementById('gmEquipmentIntelCount');
    if (count) count.textContent = locale === 'en-US' ? 'Loading equipment intelligence...' : 'Carregando inteligencia por equipamento...';
  }

  function getInsightsCacheKey(dateLike, filtersLike, localeLike) {
    const date = String(dateLike || '').trim();
    const locale = localeLike === 'en-US' ? 'en-US' : 'pt-BR';
    const filters = normalizeInsightsFilters(filtersLike || {});
    const token = getToken();
    const sessionKey = token ? `${token.slice(0, 10)}:${token.slice(-10)}` : 'anonymous';
    return `${date}::${locale}::${sessionKey}::${JSON.stringify(filters)}`;
  }

  function getInsightsPayloadFromCache(cacheKey) {
    const cached = insightsPayloadCache.get(cacheKey);
    if (!cached) return null;
    if ((Date.now() - Number(cached.at || 0)) > INSIGHTS_CACHE_TTL_MS) {
      insightsPayloadCache.delete(cacheKey);
      return null;
    }
    return cached.data || null;
  }

  function putInsightsPayloadCache(cacheKey, payload) {
    if (!cacheKey || !payload) return;
    insightsPayloadCache.set(cacheKey, { at: Date.now(), data: payload });
    while (insightsPayloadCache.size > MAX_INSIGHTS_CACHE_ENTRIES) {
      const firstKey = insightsPayloadCache.keys().next().value;
      if (!firstKey) break;
      insightsPayloadCache.delete(firstKey);
    }
  }

  function normalizeQuarterKeyLite(valueLike) {
    const raw = String(valueLike || '').trim().toUpperCase();
    if (!raw) return '';
    const m = raw.match(/^(\d{4})[-\s]?Q([1-4])$/);
    if (!m) return '';
    return `${m[1]}-Q${m[2]}`;
  }

  function getQuarterKeyFromDate(dateLike) {
    const text = String(dateLike || '').trim();
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
    const quarter = Math.floor((month - 1) / 3) + 1;
    return `${String(year).padStart(4, '0')}-Q${quarter}`;
  }

  function shiftQuarterKeyLite(quarterKeyLike, deltaLike) {
    const quarterKey = normalizeQuarterKeyLite(quarterKeyLike);
    const delta = Number(deltaLike || 0);
    if (!quarterKey || !Number.isFinite(delta)) return '';
    const m = quarterKey.match(/^(\d{4})-Q([1-4])$/);
    if (!m) return '';
    const year = Number(m[1]);
    const quarter = Number(m[2]);
    const quarterIndex = (year * 4) + (quarter - 1) + delta;
    const targetYear = Math.floor(quarterIndex / 4);
    const targetQuarter = (quarterIndex % 4) + 1;
    return `${String(targetYear).padStart(4, '0')}-Q${targetQuarter}`;
  }

  function formatQuarterLabelLite(quarterKeyLike, locale) {
    const quarterKey = normalizeQuarterKeyLite(quarterKeyLike);
    if (!quarterKey) return '--';
    const m = quarterKey.match(/^(\d{4})-Q([1-4])$/);
    if (!m) return quarterKey;
    const year = Number(m[1]);
    const quarter = Number(m[2]);
    if (locale === 'en-US') return `Q${quarter} ${year}`;
    return `${year} - T${quarter}`;
  }

  function buildQuarterSelectorOptions(baseQuarterLike, locale) {
    const baseQuarter = normalizeQuarterKeyLite(baseQuarterLike);
    if (!baseQuarter) return [];
    const rows = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const q = shiftQuarterKeyLite(baseQuarter, -offset);
      if (!q) continue;
      rows.push({ value: q, label: formatQuarterLabelLite(q, locale) });
    }
    return rows;
  }

  function getQuarterlyPanelHero() {
    return document.querySelector('#gmTabPanelTrimestral .gm-quarterly-hero');
  }

  function setQuarterlyPanelHeroFlags(partial, lowQuality) {
    const hero = getQuarterlyPanelHero();
    if (!hero) return;
    hero.classList.toggle('is-partial', !!partial);
    hero.classList.toggle('is-low-quality', !!lowQuality);
  }

  function setQuarterlyAlertBadge(id, isVisible, text, tone) {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (typeof text === 'string' && text.trim()) badge.textContent = text.trim();
    badge.hidden = !isVisible;
    badge.classList.remove('is-partial', 'is-low');
    if (isVisible && tone === 'partial') badge.classList.add('is-partial');
    if (isVisible && tone === 'low') badge.classList.add('is-low');
  }

  function setQuarterlyDownloadLinks(quarterKeyLike) {
    const quarterKey = normalizeQuarterKeyLite(quarterKeyLike);
    const pdf = document.getElementById('gmQuarterlyDownloadPdf');
    const excel = document.getElementById('gmQuarterlyDownloadExcel');
    const json = document.getElementById('gmQuarterlyDownloadJson');
    if (!quarterKey) {
      if (pdf) pdf.href = '#';
      if (excel) excel.href = '#';
      if (json) json.href = '#';
      return;
    }
    if (pdf) pdf.href = withAuth(`/api/reports/executive-quarterly/pdf/${encodeURIComponent(quarterKey)}`);
    if (excel) excel.href = withAuth(`/api/reports/executive-quarterly/excel/${encodeURIComponent(quarterKey)}`);
    if (json) json.href = withAuth(`/api/reports/executive-quarterly/json/${encodeURIComponent(quarterKey)}`);
  }

  function getQuarterlyCacheKey(quarterKeyLike, localeLike) {
    const quarterKey = normalizeQuarterKeyLite(quarterKeyLike);
    const locale = localeLike === 'en-US' ? 'en-US' : 'pt-BR';
    if (!quarterKey) return '';
    return `${quarterKey}::${locale}`;
  }

  function getQuarterlyPayloadFromCache(cacheKey) {
    const cached = quarterlyUiState.cache.get(cacheKey);
    if (!cached) return null;
    if ((Date.now() - Number(cached.at || 0)) > QUARTERLY_CACHE_TTL_MS) {
      quarterlyUiState.cache.delete(cacheKey);
      return null;
    }
    return cached.data || null;
  }

  function putQuarterlyPayloadCache(cacheKey, dataLike) {
    if (!cacheKey) return;
    quarterlyUiState.cache.set(cacheKey, {
      at: Date.now(),
      data: dataLike
    });
    while (quarterlyUiState.cache.size > 18) {
      const firstKey = quarterlyUiState.cache.keys().next().value;
      if (!firstKey) break;
      quarterlyUiState.cache.delete(firstKey);
    }
  }

  function parseQuarterlyResponsePayload(rawLike) {
    const raw = (rawLike && typeof rawLike === 'object') ? rawLike : {};
    if (raw.executiveQuarterly && typeof raw.executiveQuarterly === 'object') {
      return raw.executiveQuarterly;
    }
    if (raw.period && raw.overview && raw.mix && raw.rankings) {
      return raw;
    }
    return null;
  }

  async function fetchQuarterlyExecutivePayload(quarterKeyLike, locale) {
    const quarterKey = normalizeQuarterKeyLite(quarterKeyLike);
    if (!quarterKey) return null;
    const cacheKey = getQuarterlyCacheKey(quarterKey, locale);
    const cached = getQuarterlyPayloadFromCache(cacheKey);
    if (cached) return cached;

    const token = getToken();
    const headers = {
      'x-panel-lang': locale === 'en-US' ? 'en-US' : 'pt-BR'
    };
    if (token) headers['x-auth-token'] = token;

    const response = await fetch(withAuth(`/api/reports/executive-quarterly/json/${encodeURIComponent(quarterKey)}`), {
      cache: 'no-store',
      headers
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText || !bodyText.trim()) return null;
    let raw = null;
    try {
      raw = JSON.parse(bodyText);
    } catch (_) {
      return null;
    }
    const parsed = parseQuarterlyResponsePayload(raw);
    if (parsed) putQuarterlyPayloadCache(cacheKey, parsed);
    return parsed;
  }

  function buildQuarterlyOverviewRows(executive, locale, t) {
    const overview = (executive?.overview && typeof executive.overview === 'object') ? executive.overview : {};
    const rows = [
      {
        title: t.quarterlyOverviewCritical,
        detail: `${Number(overview.criticalCount || 0)} | ${formatPct(overview.criticalRatePct || 0, locale, 1)}`
      },
      {
        title: t.quarterlyOverviewFinancialRisk,
        detail: `R$ ${formatMoney(overview.financialRiskEstimated || 0)}`
      },
      {
        title: t.quarterlyOverviewAlerts,
        detail: `${Number(overview.recordsWithAlert || 0)} ${t.woUnit}`
      },
      {
        title: t.quarterlyOverviewTopProduct,
        detail: String(overview.produtoTop || '--')
      }
    ];
    return rows;
  }

  function buildQuarterlyMixRows(executive, locale, t) {
    const mix = (executive?.mix && typeof executive.mix === 'object') ? executive.mix : {};
    const rankings = (executive?.rankings && typeof executive.rankings === 'object') ? executive.rankings : {};
    const topService = getFirstDistributionEntry(mix.serviceType);
    const topWarrantyStatus = getFirstDistributionEntry(mix.warrantyStatus);
    const topWarrantyType = getFirstDistributionEntry(mix.warrantyType);
    const topCause = Array.isArray(rankings.topProbableCause) ? rankings.topProbableCause[0] : null;
    const topOutcome = Array.isArray(rankings.topOutcome) ? rankings.topOutcome[0] : null;
    return [
      {
        title: t.quarterlyMixServiceType,
        detail: `${taxonomyValueLabel('serviceType', topService?.key || 'nao_identificado', locale)} | ${formatPct(topService?.ratePct || 0, locale, 1)}`
      },
      {
        title: t.quarterlyMixWarrantyStatus,
        detail: `${taxonomyValueLabel('warrantyStatus', topWarrantyStatus?.key || 'nao_identificado', locale)} | ${formatPct(topWarrantyStatus?.ratePct || 0, locale, 1)}`
      },
      {
        title: t.quarterlyMixWarrantyType,
        detail: `${taxonomyValueLabel('warrantyType', topWarrantyType?.key || 'nao_identificado', locale)} | ${formatPct(topWarrantyType?.ratePct || 0, locale, 1)}`
      },
      {
        title: t.quarterlyMixCause,
        detail: `${taxonomyValueLabel('probableCause', topCause?.key || 'indefinido', locale)} | ${formatPct(topCause?.sharePct || topCause?.ratePct || 0, locale, 1)}`
      },
      {
        title: t.quarterlyMixOutcome,
        detail: `${taxonomyValueLabel('outcomeType', topOutcome?.key || 'indefinido', locale)} | ${formatPct(topOutcome?.sharePct || topOutcome?.ratePct || 0, locale, 1)}`
      }
    ];
  }

  function renderQuarterlyReviewQueueList(id, itemsLike, locale, t) {
    const box = document.getElementById(id);
    if (!box) return;
    const items = orderReviewQueueItems(Array.isArray(itemsLike) ? itemsLike : []).slice(0, 5);
    if (!items.length) {
      box.innerHTML = '<div class="gm-tax-review-item is-closed">'
        + '<div class="gm-tax-review-item-head"><strong>' + escapeHtml(t.quarterlyNoReviewTitle) + '</strong>'
        + '<span class="gm-tax-review-badge none">' + escapeHtml(t.monitor) + '</span></div>'
        + '<p>' + escapeHtml(t.quarterlyNoReviewDetail) + '</p>'
        + '</div>';
      return;
    }

    box.innerHTML = items.map((item, idx) => {
      const priorityKey = normalizeReviewPriority(item?.priority);
      const priorityText = reviewPriorityText(priorityKey, t);
      const statusText = workflowStatusText(item?.status, t);
      const statusClass = workflowStatusBadgeClass(item?.status);
      const isOverdue = isReviewItemOverdue(item);
      const dueAtText = item?.dueAt ? formatDateTimeLocal(item.dueAt, locale) : t.quarterlyNoQueueDue;
      const reviewer = formatReviewerLabel(item?.recommendedReviewer, locale, t);
      const historyPreview = Array.isArray(item?.historyPreview) ? item.historyPreview.slice(0, 2) : [];
      const monthTag = String(item?.month || '').trim();
      return '<div class="gm-tax-review-item' + (isOverdue ? ' is-overdue' : '') + '">'
        + '<div class="gm-tax-review-item-head">'
        + '<strong>' + escapeHtml(`${idx + 1}. ${item?.code || '--'}`) + '</strong>'
        + '<div class="gm-tax-review-item-badges">'
        + '<span class="gm-tax-review-badge ' + escapeHtml(priorityKey) + '">' + escapeHtml(priorityText) + '</span>'
        + '<span class="gm-tax-review-badge ' + escapeHtml(statusClass) + '">' + escapeHtml(statusText) + '</span>'
        + (isOverdue ? '<span class="gm-tax-review-badge overdue">' + escapeHtml(t.reviewOverdueBadge) + '</span>' : '')
        + '</div>'
        + '</div>'
        + '<p>' + escapeHtml(String(item?.reviewReason || t.reviewNoReason || '').trim()) + '</p>'
        + '<div class="gm-tax-review-meta">'
        + '<span>' + escapeHtml(`${t.reviewReviewerLabel}: ${reviewer}`) + '</span>'
        + '<span>' + escapeHtml(`${t.reviewDueLabel}: ${dueAtText}`) + '</span>'
        + '<span>' + escapeHtml(`${t.reviewImpactLabel}: ${String(item?.impact || '--')}`) + '</span>'
        + (monthTag ? '<span>' + escapeHtml(`${t.periodLabel}: ${monthTag}`) + '</span>' : '')
        + '</div>'
        + (historyPreview.length
          ? '<div class="gm-tax-review-history">'
            + historyPreview.map((entry) => {
              const entryAt = entry?.at ? formatDateTimeLocal(entry.at, locale) : '--';
              const entryAction = reviewActionText(entry?.action || '', t);
              const entryBy = String(entry?.byUser || '--');
              return '<div class="gm-tax-review-history-line"><strong>' + escapeHtml(entryAt) + '</strong><span>'
                + escapeHtml(`${entryAction} • ${entryBy}`)
                + '</span></div>';
            }).join('')
            + '</div>'
          : '')
        + '</div>';
    }).join('');
  }

  function ensureQuarterlySelector(selectionQuarter, locale) {
    const select = document.getElementById('gmQuarterlySelect');
    if (!select) return selectionQuarter;
    const normalizedSelection = normalizeQuarterKeyLite(selectionQuarter);
    const baseQuarter = normalizedSelection
      || normalizeQuarterKeyLite(quarterlyUiState.activeQuarter)
      || getQuarterKeyFromDate(activeDate())
      || getQuarterKeyFromDate(getLocalISODate(new Date()));
    const options = buildQuarterSelectorOptions(baseQuarter, locale);
    const currentValue = normalizeQuarterKeyLite(select.value);
    const preserveValue = currentValue || normalizedSelection || baseQuarter;
    select.innerHTML = options.map((row) => {
      const selected = row.value === preserveValue ? ' selected' : '';
      return `<option value="${escapeHtml(row.value)}"${selected}>${escapeHtml(row.label)}</option>`;
    }).join('');
    if (!select.value && options[0]?.value) {
      select.value = options[0].value;
    }

    if (select.dataset.quarterlyBound !== '1') {
      select.dataset.quarterlyBound = '1';
      select.addEventListener('change', () => {
        const pickedQuarter = normalizeQuarterKeyLite(select.value);
        quarterlyUiState.selectedQuarter = pickedQuarter;
        quarterlyUiState.manualSelection = true;
        refreshQuarterlyExecutivePanel({ forceReload: false }).catch(() => {});
      });
    }
    return normalizeQuarterKeyLite(select.value) || baseQuarter;
  }

  function renderQuarterlyPanelEmpty(quarterKeyLike, locale, t) {
    const quarterKey = normalizeQuarterKeyLite(quarterKeyLike) || getQuarterKeyFromDate(activeDate());
    const quarterLabel = formatQuarterLabelLite(quarterKey, locale);
    setText('gmQuarterlyHeroSummary', t.quarterlyHeroSummaryEmpty);
    setText('gmQuarterlyQuarter', quarterLabel);
    setText('gmQuarterlyReferenceDate', `${t.quarterlyRefDate}: --`);
    setText('gmQuarterlyTotalOs', 0);
    setText('gmQuarterlyMonthsWithData', `${t.quarterlyMonthsWithData}: 0/3`);
    setText('gmQuarterlySampleDays', 0);
    setText('gmQuarterlyReworkRate', `${t.quarterlyReworkRate}: 0%`);
    setText('gmQuarterlyOpenQueue', 0);
    setText('gmQuarterlyOverdueQueue', `${t.quarterlyOverdue}: 0`);
    setText('gmQuarterlyQualityLevel', '--');
    setText('gmQuarterlyAvgConfidence', '0%');
    setText('gmQuarterlyCoverage', '0%');
    setText('gmQuarterlyUnknownUndefined', '0% / 0%');
    setQuarterlyPanelHeroFlags(false, false);
    setQuarterlyAlertBadge('gmQuarterlyBadgePartial', false, t.quarterlyPartialBadge.replace('{monthsWithData}', '0'), 'partial');
    setQuarterlyAlertBadge('gmQuarterlyBadgeQualityLow', false, t.quarterlyQualityLowBadge, 'low');
    renderTaxList('gmQuarterlyOverviewList', [], t.quarterlyNoBaseTitle, t.quarterlyNoBaseDetail);
    renderTaxList('gmQuarterlyMixList', [], t.quarterlyNoMixTitle, t.quarterlyNoMixDetail);
    renderQuarterlyReviewQueueList('gmQuarterlyReviewList', [], locale, t);
    renderTaxTableBody('gmQuarterlyEquipmentTableBody', [], t.quarterlyNoBaseTitle);
    setText('gmQuarterlyNarrativeSummary', t.quarterlyNoNarrative);
    renderTaxList('gmQuarterlyNarrativeList', [], t.quarterlyNoFindingsTitle, t.quarterlyNoFindingsDetail);
  }

  function renderQuarterlyPanelFromPayload(executiveLike, quarterKeyLike, locale, t) {
    const executive = (executiveLike && typeof executiveLike === 'object') ? executiveLike : null;
    if (!executive) {
      renderQuarterlyPanelEmpty(quarterKeyLike, locale, t);
      return;
    }
    const period = (executive.period && typeof executive.period === 'object') ? executive.period : {};
    const overview = (executive.overview && typeof executive.overview === 'object') ? executive.overview : {};
    const quality = (executive.quality && typeof executive.quality === 'object') ? executive.quality : {};
    const reviewQueue = (executive.reviewQueue && typeof executive.reviewQueue === 'object') ? executive.reviewQueue : {};
    const rankings = (executive.rankings && typeof executive.rankings === 'object') ? executive.rankings : {};
    const narrative = (executive.narrative && typeof executive.narrative === 'object') ? executive.narrative : {};
    const quarterKey = normalizeQuarterKeyLite(period.quarter || quarterKeyLike);
    const monthsWithData = Number(overview.monthsWithData || period.monthsWithData || 0);
    const classificationQuality = String(quality.classificationQuality || '').toLowerCase();
    const isPartial = monthsWithData > 0 && monthsWithData < 3;
    const isLowQuality = classificationQuality === 'low';
    const qualityText = taxonomyValueLabel('quality', classificationQuality || 'low', locale);
    const quarterLabel = String(period.label || formatQuarterLabelLite(quarterKey, locale) || '--');
    const referenceDate = String(period.referenceDate || '').trim();
    const totalOs = Number(overview.totalOs || period.totalOs || 0);
    const sampleDays = Number(overview.sampleDays || period.sampleDays || 0);
    const reworkPct = Number(overview.reworkRatePct || 0);
    const queueOpen = Number(reviewQueue.open || 0);
    const queueOverdue = Number(reviewQueue.overdue || 0);
    const unknownPct = Number(quality.percentNaoIdentificado || 0);
    const undefinedPct = Number(quality.percentIndefinido || 0);
    const coveragePct = Number(quality.coveragePct || 0);
    const confidencePct = Number(quality.avgConfidencePct || 0);
    const heroSummary = String(narrative.executiveSummary || t.quarterlyHeroSummary).trim() || t.quarterlyHeroSummary;
    const partialBadgeText = t.quarterlyPartialBadge.replace('{monthsWithData}', String(monthsWithData));

    setText('gmQuarterlyHeroSummary', heroSummary);
    setText('gmQuarterlyQuarter', quarterLabel);
    setText('gmQuarterlyReferenceDate', `${t.quarterlyRefDate}: ${referenceDate ? formatDate(referenceDate) : '--'}`);
    setText('gmQuarterlyTotalOs', totalOs);
    setText('gmQuarterlyMonthsWithData', `${t.quarterlyMonthsWithData}: ${monthsWithData}/3`);
    setText('gmQuarterlySampleDays', sampleDays);
    setText('gmQuarterlyReworkRate', `${t.quarterlyReworkRate}: ${formatPct(reworkPct, locale, 1)}`);
    setText('gmQuarterlyOpenQueue', queueOpen);
    setText('gmQuarterlyOverdueQueue', `${t.quarterlyOverdue}: ${queueOverdue}`);
    setText('gmQuarterlyQualityLevel', qualityText);
    setText('gmQuarterlyAvgConfidence', formatPct(confidencePct, locale, 1));
    setText('gmQuarterlyCoverage', formatPct(coveragePct, locale, 1));
    setText('gmQuarterlyUnknownUndefined', `${formatPct(unknownPct, locale, 1)} / ${formatPct(undefinedPct, locale, 1)}`);
    setQuarterlyPanelHeroFlags(isPartial, isLowQuality);
    setQuarterlyAlertBadge('gmQuarterlyBadgePartial', isPartial, partialBadgeText, 'partial');
    setQuarterlyAlertBadge('gmQuarterlyBadgeQualityLow', isLowQuality, t.quarterlyQualityLowBadge, 'low');

    renderTaxList('gmQuarterlyOverviewList', buildQuarterlyOverviewRows(executive, locale, t), t.quarterlyNoBaseTitle, t.quarterlyNoBaseDetail);
    renderTaxList('gmQuarterlyMixList', buildQuarterlyMixRows(executive, locale, t), t.quarterlyNoMixTitle, t.quarterlyNoMixDetail);
    renderQuarterlyReviewQueueList('gmQuarterlyReviewList', reviewQueue.openItems, locale, t);

    const equipmentRows = (Array.isArray(rankings.topEquipment) ? rankings.topEquipment : []).slice(0, 6).map((row) => ({
      col1: row?.equipment || '--',
      col2: String(Number(row?.totalOs || 0)),
      col3: taxonomyValueLabel('probableCause', row?.topCause?.key || 'indefinido', locale),
      col4: taxonomyValueLabel('outcomeType', row?.topOutcome?.key || 'indefinido', locale)
    }));
    renderTaxTableBody('gmQuarterlyEquipmentTableBody', equipmentRows, t.quarterlyNoBaseTitle);

    const narrativeRows = [];
    const pushNarrativeRows = (title, listLike, maxItems) => {
      const list = Array.isArray(listLike) ? listLike : [];
      list.slice(0, maxItems).forEach((line) => {
        narrativeRows.push({
          title,
          detail: line
        });
      });
    };
    pushNarrativeRows(t.quarterlyNarrativeRisks, narrative.quarterRisks, 3);
    pushNarrativeRows(t.quarterlyNarrativeActions, narrative.recommendedActions, 3);
    pushNarrativeRows(t.quarterlyNarrativeHumanReview, narrative.humanReviewPoints, 2);
    pushNarrativeRows(t.quarterlyNarrativeLimitations, narrative.dataQualityLimitations, 2);
    setText('gmQuarterlyNarrativeSummary', narrative.executiveSummary || t.quarterlyNoNarrative);
    renderTaxList('gmQuarterlyNarrativeList', narrativeRows, t.quarterlyNoFindingsTitle, t.quarterlyNoFindingsDetail);
  }

  async function refreshQuarterlyExecutivePanel(optionsLike) {
    const options = (optionsLike && typeof optionsLike === 'object') ? optionsLike : {};
    const forceReload = options.forceReload === true;
    const locale = getLanguageTag();
    const t = getTaxonomyTexts(locale);
    quarterlyUiState.locale = locale;

    const defaultQuarter = getQuarterKeyFromDate(activeDate()) || getQuarterKeyFromDate(getLocalISODate(new Date()));
    if (!quarterlyUiState.manualSelection && defaultQuarter) {
      quarterlyUiState.selectedQuarter = defaultQuarter;
    }
    const selectorQuarter = normalizeQuarterKeyLite(document.getElementById('gmQuarterlySelect')?.value || '');
    const stateQuarter = normalizeQuarterKeyLite(quarterlyUiState.selectedQuarter || '');
    const targetQuarter = normalizeQuarterKeyLite(
      quarterlyUiState.manualSelection
        ? (selectorQuarter || stateQuarter || defaultQuarter)
        : (stateQuarter || defaultQuarter || selectorQuarter)
    );
    const selectedQuarter = ensureQuarterlySelector(targetQuarter, locale);
    quarterlyUiState.selectedQuarter = selectedQuarter;
    quarterlyUiState.activeQuarter = selectedQuarter;
    setQuarterlyDownloadLinks(selectedQuarter);

    if (!selectedQuarter) {
      renderQuarterlyPanelEmpty(defaultQuarter, locale, t);
      return;
    }

    const cacheKey = getQuarterlyCacheKey(selectedQuarter, locale);
    if (forceReload) quarterlyUiState.cache.delete(cacheKey);
    const currentNonce = quarterlyUiState.requestNonce + 1;
    quarterlyUiState.requestNonce = currentNonce;
    const payload = await fetchQuarterlyExecutivePayload(selectedQuarter, locale);
    if (quarterlyUiState.requestNonce !== currentNonce) return;
    if (!payload || Number(payload?.overview?.totalOs || 0) <= 0) {
      renderQuarterlyPanelEmpty(selectedQuarter, locale, t);
      return;
    }
    renderQuarterlyPanelFromPayload(payload, selectedQuarter, locale, t);
  }

  function renderTaxList(id, lines, emptyTitle, emptyText) {
    const box = document.getElementById(id);
    if (!box) return;
    const items = Array.isArray(lines) ? lines : [];
    if (!items.length) {
      box.innerHTML = `<div class="gm-tax-line"><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyText)}</span></div>`;
      return;
    }
    box.innerHTML = items.map((line) => {
      return `<div class="gm-tax-line"><strong>${escapeHtml(line.title)}</strong><span>${escapeHtml(line.detail)}</span></div>`;
    }).join('');
  }

  function renderTaxTableBody(id, rows, emptyLabel) {
    const body = document.getElementById(id);
    if (!body) return;
    const items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      body.innerHTML = '<div class="gm-tax-table-row"><span>' + escapeHtml(emptyLabel) + '</span><span>-</span><span>-</span><span>-</span></div>';
      return;
    }
    body.innerHTML = items.map((row) => {
      return '<div class="gm-tax-table-row">'
        + '<span>' + escapeHtml(row.col1) + '</span>'
        + '<span>' + escapeHtml(row.col2) + '</span>'
        + '<span>' + escapeHtml(row.col3) + '</span>'
        + '<span>' + escapeHtml(row.col4) + '</span>'
        + '</div>';
    }).join('');
  }

  function renderEquipmentIntelList(id, rows, locale, emptyLabel) {
    const box = document.getElementById(id);
    if (!box) return;
    bindEquipmentIntelControls();
    bindEquipmentEvidenceLazyRender();
    equipmentEvidenceCache.clear();
    const filters = readEquipmentIntelFilters();
    const sourceItems = (Array.isArray(rows) ? rows : [])
      .filter((row) => !isEquipmentUnidentifiedName(row?.equipment || row?.equipmentName))
      .map((row) => getEquipmentRowIntel(row, locale))
      .filter((item) => {
        if (filters.text && !String(item.equipmentName || '').toLowerCase().includes(filters.text)) return false;
        if (filters.risk && String(item.riskLevel || '').toLowerCase() !== filters.risk) return false;
        if (filters.quality && String(item.analysisQuality || '').toLowerCase() !== filters.quality) return false;
        if (filters.type && String(item.solutionType || '').toLowerCase() !== filters.type) return false;
        return true;
      });
    const items = sourceItems.slice(0, equipmentIntelExpanded ? sourceItems.length : 20);
    const allRows = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      const hasImportedWithoutEquipment = allRows.some((row) => isEquipmentUnidentifiedName(row?.equipment || row?.equipmentName) && equipmentSafeNumber(row?.totalOs, 0) > 0);
      const message = hasImportedWithoutEquipment
        ? (locale === 'en-US' ? 'Imported WO, but without identified equipment.' : 'OS importadas, porém sem equipamento identificado')
        : (emptyLabel || equipmentFallbackText(locale, 'waiting'));
      box.innerHTML = '<div class="gm-equipment-intel-empty">' + escapeHtml(message) + '</div>';
      const countBox = document.getElementById('gmEquipmentIntelCount');
      if (countBox) countBox.textContent = 'Exibindo 0 de 0 equipamentos';
      return;
    }
    const countBox = document.getElementById('gmEquipmentIntelCount');
    if (countBox) {
      const hiddenCount = Math.max(0, sourceItems.length - items.length);
      countBox.innerHTML = `Exibindo ${items.length} de ${sourceItems.length} equipamentos${hiddenCount ? ' <button type="button" class="gm-equipment-show-all" id="gmEquipmentShowAll">Ver todos</button>' : ''}`;
    }
    const header = '<div class="gm-equipment-intel-table-head">'
      + '<span>Equipamento</span>'
      + '<span>OS</span>'
      + '<span>% período</span>'
      + '<span>Causa provável</span>'
      + '<span>Solução dominante</span>'
      + '<span>Tipo</span>'
      + '<span>Risco</span>'
      + '<span>Qualidade</span>'
      + '<span>Ação recomendada</span>'
      + '</div>';
    const rowsHtml = items.map((item, idx) => {
      const risk = String(item.riskLevel || 'low').toLowerCase();
      const evidenceKey = `eq-${idx}-${String(item.equipmentName || '').slice(0, 24)}`;
      equipmentEvidenceCache.set(evidenceKey, {
        lines: Array.isArray(item.evidence) ? item.evidence.slice(0, 3) : [],
        fallback: locale === 'en-US' ? 'Insufficient data for specific evidence.' : 'Sem dados suficientes para evidencia especifica.'
      });
      const evidenceFallback = locale === 'en-US' ? 'Insufficient data for specific evidence.' : 'Sem dados suficientes para evidência específica.';
      return '<article class="gm-equipment-intel-row">'
        + '<strong class="gm-equipment-name">' + escapeHtml(item.equipmentName) + '</strong>'
        + '<span data-label="OS">' + escapeHtml(String(item.totalOs)) + '</span>'
        + '<span data-label="% período">' + escapeHtml(formatPct(item.percentOfPeriod, locale, 1)) + '</span>'
        + '<span data-label="Causa provável">' + escapeHtml(item.dominantProbableCause) + '</span>'
        + '<span data-label="Solução dominante">' + escapeHtml(item.dominantSolution) + '</span>'
        + '<span data-label="Tipo">' + escapeHtml(equipmentSolutionTypeLabel(item.solutionType, locale)) + '</span>'
        + '<span data-label="Risco"><span class="gm-equipment-risk ' + escapeHtml(risk) + '">' + escapeHtml(equipmentRiskLabel(risk, locale)) + '</span></span>'
        + '<span data-label="Qualidade">' + escapeHtml(equipmentAnalysisQualityLabel(item.analysisQuality, locale)) + ' | ' + escapeHtml(formatPct(item.confidencePct, locale, 0)) + '</span>'
        + '<div class="gm-equipment-action" data-label="Ação recomendada">'
        + '<span>' + escapeHtml(item.recommendedAction) + '</span>'
        + '<details class="gm-equipment-evidence" data-equipment-evidence-key="' + escapeHtml(evidenceKey) + '">'
        + '<summary>Ver evidências</summary>'
        + '<div class="gm-equipment-evidence-placeholder">Clique para carregar evidencias.</div>'
        + '</details>'
        + '</div>'
        + '</article>';
    }).join('');
    box.innerHTML = header + rowsHtml;
    const showAllBtn = document.getElementById('gmEquipmentShowAll');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        equipmentIntelExpanded = true;
        renderTaxonomy(lastInsightsPayload || {});
      }, { once: true });
    }
  }

  function bindEquipmentEvidenceLazyRender() {
    if (equipmentEvidenceBound) return;
    equipmentEvidenceBound = true;
    document.addEventListener('toggle', function (event) {
      const details = event.target;
      if (!(details instanceof HTMLElement)) return;
      if (!details.matches('.gm-equipment-evidence')) return;
      if (!details.open || details.dataset.loaded === '1') return;
      const key = String(details.getAttribute('data-equipment-evidence-key') || '');
      const cached = equipmentEvidenceCache.get(key) || {};
      const lines = Array.isArray(cached.lines) ? cached.lines : [];
      const fallback = String(cached.fallback || 'Sem dados suficientes para evidencia especifica.');
      details.dataset.loaded = '1';
      details.innerHTML = '<summary>Ver evidencias</summary><ul>'
        + (lines.length
          ? lines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('')
          : '<li>' + escapeHtml(fallback) + '</li>')
        + '</ul>';
    }, true);
  }

  function valueToneByPct(value) {
    const v = Number(value || 0);
    if (v >= 30) return 'bad';
    if (v >= 15) return 'warn';
    return '';
  }

  function renderTaxBarChart(id, rows, emptyText, toneResolver) {
    const box = document.getElementById(id);
    if (!box) return;
    const items = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.value || 0) > 0);
    if (!items.length) {
      box.innerHTML = '<div class="gm-tax-chart-empty">' + escapeHtml(emptyText) + '</div>';
      return;
    }
    const max = Math.max(1, ...items.map((row) => Number(row.value || 0)));
    box.innerHTML = items.map((row) => {
      const value = Number(row.value || 0);
      const width = Math.max(6, Math.round((value / max) * 100));
      const tone = typeof toneResolver === 'function' ? String(toneResolver(row) || '') : '';
      const toneClass = tone ? ' ' + tone : '';
      return '<div class="gm-tax-chart-row">'
        + '<span class="name">' + escapeHtml(row.name) + '</span>'
        + '<div class="gm-tax-bar-track"><div class="gm-tax-bar-fill' + toneClass + '" style="width:' + width + '%"></div></div>'
        + '<span class="value">' + escapeHtml(row.label || String(value)) + '</span>'
        + '</div>';
    }).join('');
  }

  function getAxisLabel(axisKey, t) {
    if (axisKey === 'serviceType') return t.dominantService;
    if (axisKey === 'warrantyType') return t.axisWarrantyType;
    if (axisKey === 'garantiaStatus') return t.axisWarrantyStatus;
    if (axisKey === 'probableCause') return t.topCause;
    if (axisKey === 'outcomeType') return t.topOutcome;
    return axisKey;
  }

  function resolvePrioritySeverity(qualityLevel, quality, pendingOutcomeTotal) {
    const q = String(qualityLevel || '').toLowerCase();
    const unknown = Number(quality?.percentNaoIdentificado || 0);
    const undef = Number(quality?.percentIndefinido || 0);
    const pending = Number(pendingOutcomeTotal || 0);
    if (q === 'low' || unknown >= 40 || undef >= 35 || pending >= 15) return 'critical';
    if (q === 'medium' || unknown >= 25 || undef >= 20 || pending >= 8) return 'pressure';
    if (unknown >= 12 || undef >= 10 || pending >= 3) return 'attention';
    return 'stable';
  }

  function severityLabel(severityKey, t) {
    if (severityKey === 'critical') return t.severityCritical;
    if (severityKey === 'pressure') return t.severityPressure;
    if (severityKey === 'attention') return t.severityAttention;
    return t.severityStable;
  }

  function setQualityVisualPriority(qualityLevel) {
    const box = document.getElementById('gmTaxQualityBox');
    if (!box) return;
    const isLow = String(qualityLevel || '').toLowerCase() === 'low';
    box.classList.toggle('is-priority', isLow);
  }

  function normalizeReviewPriority(priorityLike) {
    const key = String(priorityLike || '').toLowerCase();
    if (key === 'critical' || key === 'high' || key === 'medium' || key === 'low' || key === 'none') return key;
    if (key === 'critica') return 'critical';
    if (key === 'alta') return 'high';
    if (key === 'media') return 'medium';
    if (key === 'baixa') return 'low';
    return 'none';
  }

  function reviewPriorityText(priorityLike, t) {
    const key = normalizeReviewPriority(priorityLike);
    if (key === 'critical') return t.reviewPriorityCritical;
    if (key === 'high') return t.reviewPriorityHigh;
    if (key === 'medium') return t.reviewPriorityMedium;
    if (key === 'low') return t.reviewPriorityLow;
    return t.reviewPriorityNone;
  }

  function formatReviewerLabel(reviewerLike, locale, t) {
    const key = String(reviewerLike || '').trim().toLowerCase();
    const dictPt = {
      gestor_operacional: 'Gerente operacional',
      gerente_operacional: 'Gerente operacional',
      gerente_operacional_campinas: 'Paulo - gerente operacional Campinas',
      tecnico_lider: 'Bruno - tecnico lider',
      engenharia_tecnica: 'Engenharia tecnica',
      lider_tecnico: 'Lider tecnico',
      lider_administrativo: 'Lider administrativo',
      coordenacao_operacional: 'Coordenacao operacional',
      monitoramento_automatico: 'Monitoramento automatico'
    };
    const dictEn = {
      gestor_operacional: 'Operations manager',
      gerente_operacional: 'Operations manager',
      gerente_operacional_campinas: 'Paulo - Campinas operations manager',
      tecnico_lider: 'Bruno - technical lead',
      engenharia_tecnica: 'Technical engineering',
      lider_tecnico: 'Technical lead',
      lider_administrativo: 'Administrative lead',
      coordenacao_operacional: 'Operations coordination',
      monitoramento_automatico: 'Automatic monitoring'
    };
    const dict = locale === 'en-US' ? dictEn : dictPt;
    if (key && dict[key]) return dict[key];
    if (!key) return t.reviewDefaultReviewer;
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function setReviewPriorityVisual(priorityLike) {
    const box = document.getElementById('gmTaxReviewPriorityBox');
    if (!box) return;
    box.classList.remove('is-critical', 'is-high', 'is-medium', 'is-low');
    const key = normalizeReviewPriority(priorityLike);
    if (key !== 'none') box.classList.add(`is-${key}`);
  }

  function normalizeWorkflowStatus(statusLike) {
    const key = String(statusLike || '').toLowerCase();
    if (key === 'novo') return 'novo';
    if (key === 'em_revisao' || key === 'em-revisao') return 'em_revisao';
    if (key === 'ajustado') return 'ajustado';
    if (key === 'validado') return 'validado';
    if (key === 'encerrado') return 'encerrado';
    if (key === 'descartado') return 'descartado';
    return 'nao_mapeado';
  }

  function workflowStatusText(statusLike, t) {
    const status = normalizeWorkflowStatus(statusLike);
    if (status === 'novo') return t.reviewStatusNovo;
    if (status === 'em_revisao') return t.reviewStatusEmRevisao;
    if (status === 'ajustado') return t.reviewStatusAjustado;
    if (status === 'validado') return t.reviewStatusValidado;
    if (status === 'encerrado') return t.reviewStatusEncerrado;
    if (status === 'descartado') return t.reviewStatusDescartado;
    return t.reviewNoStatus;
  }

  function workflowStatusBadgeClass(statusLike) {
    const status = normalizeWorkflowStatus(statusLike);
    if (status === 'novo') return 'status-open';
    if (status === 'em_revisao') return 'status-review';
    if (status === 'ajustado') return 'status-adjusted';
    if (status === 'validado') return 'status-validated';
    if (status === 'encerrado') return 'status-closed';
    if (status === 'descartado') return 'status-discarded';
    return 'none';
  }

  function isWorkflowClosedStatus(statusLike) {
    const status = normalizeWorkflowStatus(statusLike);
    return status === 'encerrado' || status === 'descartado';
  }

  function isReviewItemOverdue(itemLike) {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const status = normalizeWorkflowStatus(item.status || '');
    if (isWorkflowClosedStatus(status)) return false;
    const parsed = new Date(item.dueAt || '');
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() < Date.now();
  }

  function reviewActionText(actionLike, t) {
    const action = String(actionLike || '').toLowerCase();
    if (action === 'detected') return t.reviewActionDetected;
    if (action === 'sync_update') return t.reviewActionSyncUpdate;
    if (action === 'auto_reopen') return t.reviewActionAutoReopen;
    if (action === 'auto_encerramento') return t.reviewActionAutoClose;
    if (action === 'aceite') return t.reviewActionAceite;
    if (action === 'ajuste') return t.reviewActionAjuste;
    if (action === 'revisao') return t.reviewActionRevisao;
    if (action === 'encerramento') return t.reviewActionEncerramento;
    if (action === 'descarte') return t.reviewActionDescarte;
    return actionLike ? String(actionLike) : '--';
  }

  function reviewPriorityWeight(priorityLike) {
    const key = normalizeReviewPriority(priorityLike);
    if (key === 'critical') return 4;
    if (key === 'high') return 3;
    if (key === 'medium') return 2;
    if (key === 'low') return 1;
    return 0;
  }

  function formatReviewStatusCompact(byStatusLike, t) {
    const byStatus = (byStatusLike && typeof byStatusLike === 'object') ? byStatusLike : {};
    const novo = Number(byStatus.novo || 0);
    const revisao = Number(byStatus.em_revisao || 0);
    const ajustado = Number(byStatus.ajustado || 0);
    const validado = Number(byStatus.validado || 0);
    const encerrado = Number(byStatus.encerrado || 0);
    const descartado = Number(byStatus.descartado || 0);
    return `${t.reviewStatusByShort}: ${novo}/${revisao}/${ajustado}/${validado}/${encerrado}/${descartado}`;
  }

  function normalizeKeyLite(valueLike) {
    return String(valueLike || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeRoleLite(roleLike) {
    const role = normalizeKeyLite(roleLike);
    if (role === 'administrator') return 'admin';
    if (role === 'technical_lead') return 'lider_tecnico';
    if (role === 'administrative_lead') return 'lider_administrativo';
    return role;
  }

  function getCurrentReviewUser() {
    try {
      if (typeof window.getPanelCurrentUser === 'function') {
        return window.getPanelCurrentUser() || null;
      }
    } catch (_) {}
    return null;
  }

  function canUserMutateReviewAction(actionLike, itemLike, userLike) {
    const action = normalizeKeyLite(actionLike);
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const user = (userLike && typeof userLike === 'object') ? userLike : {};
    const role = normalizeRoleLite(user.role || '');
    const reviewer = normalizeKeyLite(item.recommendedReviewer || '');
    const ownerUser = normalizeKeyLite(item.ownerUser || '');
    const actorUser = normalizeKeyLite(user.username || '');

    if (role === 'admin') return true;
    if (!action) return false;
    if (action === 'descarte') return false;
    if (ownerUser && actorUser && ownerUser === actorUser) return true;
    if (role === 'lider_tecnico') {
      return reviewer === 'lider_tecnico' || reviewer === 'engenharia_tecnica';
    }
    if (role === 'lider_administrativo') {
      return reviewer === 'lider_administrativo';
    }
    return false;
  }

  function getReviewAllowedActions(itemLike, userLike) {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const status = normalizeWorkflowStatus(item.status || 'novo');
    const candidates = REVIEW_ACTIONS_BY_STATUS[status] || [];
    return candidates.filter((action) => canUserMutateReviewAction(action, item, userLike));
  }

  function reviewActionButtonText(actionLike, t) {
    const action = normalizeKeyLite(actionLike);
    if (action === 'aceite') return t.reviewBtnAccept;
    if (action === 'ajuste') return t.reviewBtnAdjust;
    if (action === 'revisao') return t.reviewBtnReview;
    if (action === 'encerramento') return t.reviewBtnClose;
    if (action === 'descarte') return t.reviewBtnDiscard;
    return actionLike || '--';
  }

  function buildDefaultDueAtIso(priorityLike) {
    const now = new Date();
    function addBusinessDays(dateObj, businessDays) {
      const result = new Date(dateObj.getTime());
      let remaining = Math.max(0, Number(businessDays || 0));
      while (remaining > 0) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay();
        if (day === 0 || day === 6) continue;
        remaining -= 1;
      }
      return result;
    }
    const priority = normalizeReviewPriority(priorityLike);
    if (priority === 'critical') {
      now.setHours(now.getHours() + 4);
    } else if (priority === 'high') {
      return addBusinessDays(now, 1).toISOString();
    } else if (priority === 'medium') {
      return addBusinessDays(now, 3).toISOString();
    }
    return addBusinessDays(now, 5).toISOString();
  }

  function toLocalDateTimeInput(isoLike) {
    const parsed = new Date(isoLike || '');
    if (Number.isNaN(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function parseLocalDateTimeToIso(valueLike) {
    const value = String(valueLike || '').trim();
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  }

  function deepCloneObject(valueLike, fallback) {
    try {
      return JSON.parse(JSON.stringify(valueLike));
    } catch (_) {
      return fallback;
    }
  }

  function buildReviewDetailedState(detailedLike) {
    const detailed = (detailedLike && typeof detailedLike === 'object') ? detailedLike : {};
    return {
      reviewQueue: Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue.map((row) => ({ ...row })) : [],
      reviewQueueSummary: deepCloneObject(detailed.reviewQueueSummary || {}, {}),
      reviewPriority: String(detailed.reviewPriority || 'none'),
      reviewReason: String(detailed.reviewReason || ''),
      recommendedReviewer: String(detailed.recommendedReviewer || ''),
      reviewChecklist: Array.isArray(detailed.reviewChecklist) ? detailed.reviewChecklist.slice(0, 8) : []
    };
  }

  function safeNotify(messageLike) {
    const message = String(messageLike || '').trim();
    if (!message) return;
    try {
      if (typeof window.notify === 'function') {
        window.notify(message);
        return;
      }
    } catch (_) {}
    try {
      if (typeof notify === 'function') {
        notify(message);
        return;
      }
    } catch (_) {}
  }

  function ensureReviewDetailedState() {
    if (!reviewWorkflowUiState.detailed || typeof reviewWorkflowUiState.detailed !== 'object') {
      reviewWorkflowUiState.detailed = {};
    }
    if (!Array.isArray(reviewWorkflowUiState.detailed.reviewQueue)) {
      reviewWorkflowUiState.detailed.reviewQueue = [];
    }
    if (!reviewWorkflowUiState.detailed.reviewQueueSummary || typeof reviewWorkflowUiState.detailed.reviewQueueSummary !== 'object') {
      reviewWorkflowUiState.detailed.reviewQueueSummary = {};
    }
    return reviewWorkflowUiState.detailed;
  }

  function syncReviewGuidedHeaderFromQueue() {
    const detailed = ensureReviewDetailedState();
    const queue = orderReviewQueueItems(Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue : []);
    const topItem = queue[0] || null;
    detailed.reviewPriority = topItem ? normalizeReviewPriority(topItem.priority || 'none') : 'none';
    detailed.reviewReason = topItem ? String(topItem.reviewReason || '').trim() : '';
    detailed.recommendedReviewer = topItem ? String(topItem.recommendedReviewer || '').trim() : '';
    detailed.reviewChecklist = topItem && Array.isArray(topItem.reviewChecklist)
      ? topItem.reviewChecklist.slice(0, 4)
      : [];
  }

  function mergeReviewSummaryIntoDetailed(summaryLike) {
    const detailed = ensureReviewDetailedState();
    const summary = (summaryLike && typeof summaryLike === 'object') ? summaryLike : {};
    const currentSummary = (detailed.reviewQueueSummary && typeof detailed.reviewQueueSummary === 'object')
      ? { ...detailed.reviewQueueSummary }
      : {};
    const currentWorkflow = (currentSummary.workflow && typeof currentSummary.workflow === 'object')
      ? { ...currentSummary.workflow }
      : {};
    currentSummary.workflow = {
      ...currentWorkflow,
      total: Number(summary.total ?? currentWorkflow.total ?? (Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue.length : 0) ?? 0),
      open: Number(summary.open ?? currentWorkflow.open ?? 0),
      overdue: Number(summary.overdue ?? currentWorkflow.overdue ?? 0),
      byStatus: (summary.byStatus && typeof summary.byStatus === 'object')
        ? { ...summary.byStatus }
        : (currentWorkflow.byStatus && typeof currentWorkflow.byStatus === 'object' ? { ...currentWorkflow.byStatus } : {})
    };
    detailed.reviewQueueSummary = currentSummary;
  }

  function renderGuidedReviewFromState() {
    const detailed = ensureReviewDetailedState();
    const locale = reviewWorkflowUiState.locale || getLanguageTag();
    const t = getTaxonomyTexts(locale);
    renderGuidedReview(detailed, reviewWorkflowUiState.quality || {}, locale, t);
  }

  function getHighestPriorityFromQueue(itemsLike) {
    const items = Array.isArray(itemsLike) ? itemsLike : [];
    let top = 'none';
    let weight = 0;
    items.forEach((item) => {
      const nextWeight = reviewPriorityWeight(item?.priority);
      if (nextWeight > weight) {
        weight = nextWeight;
        top = normalizeReviewPriority(item?.priority || 'none');
      }
    });
    return top;
  }

  function getNextDueAtFromQueue(itemsLike) {
    const items = Array.isArray(itemsLike) ? itemsLike : [];
    let minTs = Number.POSITIVE_INFINITY;
    items.forEach((item) => {
      if (isWorkflowClosedStatus(item?.status)) return;
      const parsed = new Date(item?.dueAt || '');
      if (Number.isNaN(parsed.getTime())) return;
      const ts = parsed.getTime();
      if (ts < minTs) minTs = ts;
    });
    if (!Number.isFinite(minTs)) return '';
    return new Date(minTs).toISOString();
  }

  function orderReviewQueueItems(itemsLike) {
    const items = Array.isArray(itemsLike) ? itemsLike.slice() : [];
    return items.sort((a, b) => {
      const aPriority = reviewPriorityWeight(a?.priority);
      const bPriority = reviewPriorityWeight(b?.priority);
      if (bPriority !== aPriority) return bPriority - aPriority;
      const aOverdue = isReviewItemOverdue(a) ? 1 : 0;
      const bOverdue = isReviewItemOverdue(b) ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;
      const aClosed = isWorkflowClosedStatus(a?.status) ? 1 : 0;
      const bClosed = isWorkflowClosedStatus(b?.status) ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      const aDue = new Date(a?.dueAt || '').getTime();
      const bDue = new Date(b?.dueAt || '').getTime();
      const safeADue = Number.isFinite(aDue) ? aDue : Number.POSITIVE_INFINITY;
      const safeBDue = Number.isFinite(bDue) ? bDue : Number.POSITIVE_INFINITY;
      if (safeADue !== safeBDue) return safeADue - safeBDue;
      const aCode = String(a?.code || '');
      const bCode = String(b?.code || '');
      return aCode.localeCompare(bCode);
    });
  }

  function renderReviewQueueList(id, itemsLike, locale, t) {
    const box = document.getElementById(id);
    if (!box) return;
    const items = orderReviewQueueItems(itemsLike).slice(0, 5);
    const currentUser = getCurrentReviewUser();
    if (!items.length) {
      box.innerHTML = '<div class="gm-tax-review-item">'
        + '<div class="gm-tax-review-item-head"><strong>' + escapeHtml(t.reviewNoQueueTitle) + '</strong>'
        + '<div class="gm-tax-review-item-badges"><span class="gm-tax-review-badge none">' + escapeHtml(t.reviewPriorityNone) + '</span></div></div>'
        + '<p>' + escapeHtml(t.reviewNoQueueText) + '</p>'
        + '</div>';
      return;
    }

    box.innerHTML = items.map((item, index) => {
      const priorityKey = normalizeReviewPriority(item?.priority);
      const priorityText = reviewPriorityText(priorityKey, t);
      const statusText = workflowStatusText(item?.status, t);
      const statusBadgeClass = workflowStatusBadgeClass(item?.status);
      const reason = String(item?.reviewReason || t.reviewNoReason || '').trim();
      const impact = String(item?.impact || '').trim();
      const reviewer = formatReviewerLabel(item?.recommendedReviewer, locale, t);
      const dueAtText = item?.dueAt ? formatDateTimeLocal(item.dueAt, locale) : t.reviewNoDueAt;
      const lastActionText = reviewActionText(item?.lastAction || '', t);
      const code = String(item?.code || '').trim();
      const title = `${index + 1}. ${code || t.reviewNoQueueTitle}`;
      const isOverdue = isReviewItemOverdue(item);
      const closed = isWorkflowClosedStatus(item?.status);
      const workflowId = String(item?.workflowId || '').trim();
      const expectedVersion = Math.max(1, Number(item?.version || 1));
      const pendingAction = reviewWorkflowUiState.pendingByWorkflow.get(workflowId) || '';
      const allowedActions = getReviewAllowedActions(item, currentUser);
      const itemClasses = [
        'gm-tax-review-item',
        isOverdue ? 'is-overdue' : '',
        closed ? 'is-closed' : ''
      ].filter(Boolean).join(' ');
      const historyPreview = Array.isArray(item?.historyPreview) ? item.historyPreview.slice(0, 2) : [];
      const historyHtml = historyPreview.length
        ? '<div class="gm-tax-review-history">'
          + historyPreview.map((entry) => {
            const entryAt = entry?.at ? formatDateTimeLocal(entry.at, locale) : '--';
            const entryAction = reviewActionText(entry?.action || '', t);
            const entryBy = String(entry?.byUser || '--');
            return '<div class="gm-tax-review-history-line">'
              + '<strong>' + escapeHtml(entryAt) + '</strong>'
              + '<span>' + escapeHtml(`${entryAction} • ${entryBy}`) + '</span>'
              + '</div>';
          }).join('')
          + '</div>'
        : '';
      const actionButtonsHtml = allowedActions.length
        ? '<div class="gm-tax-review-actions" data-workflow-id="' + escapeHtml(workflowId) + '" data-item-version="' + String(expectedVersion) + '">'
          + '<span class="gm-tax-review-actions-label">' + escapeHtml(t.reviewActionsLabel) + '</span>'
          + '<div class="gm-tax-review-actions-buttons">'
          + allowedActions.map((action) => {
            const isLoading = pendingAction === action;
            const isDisabled = Boolean(pendingAction);
            const label = isLoading ? t.reviewBtnLoading : reviewActionButtonText(action, t);
            return '<button type="button" class="gm-tax-review-action-btn"'
              + ' data-review-action="' + escapeHtml(action) + '"'
              + ' data-workflow-id="' + escapeHtml(workflowId) + '"'
              + ' data-expected-version="' + String(expectedVersion) + '"'
              + (isDisabled ? ' disabled' : '')
              + '>'
              + escapeHtml(label)
              + '</button>';
          }).join('')
          + '</div>'
          + '</div>'
        : '<div class="gm-tax-review-actions gm-tax-review-actions-empty">'
          + '<span class="gm-tax-review-actions-label">' + escapeHtml(t.reviewNoActionAllowed) + '</span>'
          + '</div>';

      return '<div class="' + escapeHtml(itemClasses) + '">'
        + '<div class="gm-tax-review-item-head">'
        + '<strong>' + escapeHtml(title) + '</strong>'
        + '<div class="gm-tax-review-item-badges">'
        + '<span class="gm-tax-review-badge ' + escapeHtml(priorityKey) + '">' + escapeHtml(priorityText) + '</span>'
        + '<span class="gm-tax-review-badge ' + escapeHtml(statusBadgeClass) + '">' + escapeHtml(statusText) + '</span>'
        + (isOverdue ? '<span class="gm-tax-review-badge overdue">' + escapeHtml(t.reviewOverdueBadge) + '</span>' : '')
        + '</div>'
        + '</div>'
        + '<p>' + escapeHtml(reason) + '</p>'
        + '<div class="gm-tax-review-meta">'
        + '<span>' + escapeHtml(`${t.reviewImpactLabel}: ${impact || '--'}`) + '</span>'
        + '<span>' + escapeHtml(`${t.reviewReviewerTag}: ${reviewer}`) + '</span>'
        + '<span>' + escapeHtml(`${t.reviewDueLabel}: ${dueAtText}`) + '</span>'
        + '<span>' + escapeHtml(`${t.reviewLastActionLabel}: ${lastActionText}`) + '</span>'
        + '</div>'
        + actionButtonsHtml
        + historyHtml
        + '</div>';
    }).join('');
  }

  function findReviewQueueItemByWorkflowId(workflowIdLike) {
    const workflowId = String(workflowIdLike || '').trim();
    if (!workflowId) return null;
    const detailed = ensureReviewDetailedState();
    const queue = Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue : [];
    return queue.find((item) => String(item?.workflowId || '').trim() === workflowId) || null;
  }

  function getReviewModalNodes() {
    return {
      root: document.getElementById('gmReviewActionModal'),
      backdrop: document.querySelector('#gmReviewActionModal .gm-review-modal-backdrop'),
      kicker: document.getElementById('gmReviewModalKicker'),
      title: document.getElementById('gmReviewModalTitle'),
      closeBtn: document.getElementById('gmReviewModalCloseBtn'),
      codeLbl: document.getElementById('gmReviewModalCtxCodeLbl'),
      statusLbl: document.getElementById('gmReviewModalCtxStatusLbl'),
      priorityLbl: document.getElementById('gmReviewModalCtxPriorityLbl'),
      reviewerLbl: document.getElementById('gmReviewModalCtxReviewerLbl'),
      codeVal: document.getElementById('gmReviewModalCtxCode'),
      statusVal: document.getElementById('gmReviewModalCtxStatus'),
      priorityVal: document.getElementById('gmReviewModalCtxPriority'),
      reviewerVal: document.getElementById('gmReviewModalCtxReviewer'),
      alert: document.getElementById('gmReviewModalAlert'),
      ownerWrap: document.getElementById('gmReviewModalOwnerWrap'),
      ownerLbl: document.getElementById('gmReviewModalOwnerLbl'),
      ownerInput: document.getElementById('gmReviewModalOwnerInput'),
      dueWrap: document.getElementById('gmReviewModalDueWrap'),
      dueLbl: document.getElementById('gmReviewModalDueLbl'),
      dueInput: document.getElementById('gmReviewModalDueInput'),
      closeModeWrap: document.getElementById('gmReviewModalCloseModeWrap'),
      closeModeLbl: document.getElementById('gmReviewModalCloseModeLbl'),
      closeModeInput: document.getElementById('gmReviewModalCloseModeInput'),
      noteWrap: document.getElementById('gmReviewModalNoteWrap'),
      noteLbl: document.getElementById('gmReviewModalNoteLbl'),
      noteInput: document.getElementById('gmReviewModalNoteInput'),
      cancelBtn: document.getElementById('gmReviewModalCancelBtn'),
      submitBtn: document.getElementById('gmReviewModalSubmitBtn')
    };
  }

  function hideReviewActionModal() {
    const nodes = getReviewModalNodes();
    if (!nodes.root) return;
    nodes.root.classList.remove('is-open');
    nodes.root.setAttribute('aria-hidden', 'true');
  }

  function showReviewActionModal() {
    const nodes = getReviewModalNodes();
    if (!nodes.root) return;
    nodes.root.classList.add('is-open');
    nodes.root.setAttribute('aria-hidden', 'false');
  }

  function setReviewModalError(messageLike) {
    const nodes = getReviewModalNodes();
    if (!nodes.alert) return;
    const message = String(messageLike || '').trim();
    nodes.alert.textContent = message;
    nodes.alert.hidden = !message;
  }

  function closeReviewActionModal(resultLike) {
    const resolver = reviewModalState.resolver;
    reviewModalState.open = false;
    reviewModalState.action = '';
    reviewModalState.workflowId = '';
    reviewModalState.item = null;
    reviewModalState.resolver = null;
    setReviewModalError('');
    hideReviewActionModal();
    if (typeof resolver === 'function') {
      resolver(resultLike || { confirmed: false, reason: 'cancelled' });
    }
  }

  function submitReviewActionModal() {
    if (!reviewModalState.open) return;
    const nodes = getReviewModalNodes();
    const action = normalizeKeyLite(reviewModalState.action);
    const t = getTaxonomyTexts(reviewWorkflowUiState.locale || getLanguageTag());
    if (!nodes.root) {
      closeReviewActionModal({ confirmed: false, reason: 'modal_missing' });
      return;
    }

    const note = String(nodes.noteInput?.value || '').trim();
    const ownerUser = String(nodes.ownerInput?.value || '').trim();
    const dueAt = parseLocalDateTimeToIso(nodes.dueInput?.value || '');
    const closeResult = String(nodes.closeModeInput?.value || '').trim();

    if (action === 'ajuste') {
      if (!note) {
        setReviewModalError(t.reviewModalErrorRequired);
        return;
      }
      closeReviewActionModal({ confirmed: true, fields: { note } });
      return;
    }
    if (action === 'revisao') {
      if (!ownerUser || !note) {
        setReviewModalError(t.reviewModalErrorRequired);
        return;
      }
      if (!dueAt) {
        setReviewModalError(t.reviewModalErrorDueAt);
        return;
      }
      closeReviewActionModal({ confirmed: true, fields: { ownerUser, dueAt, note } });
      return;
    }
    if (action === 'encerramento') {
      const resultValue = closeResult === 'encerrado_sem_acao' ? 'encerrado_sem_acao' : 'encerrado_com_acao';
      closeReviewActionModal({ confirmed: true, fields: { closeResult: resultValue, note } });
      return;
    }
    if (action === 'descarte') {
      if (!note) {
        setReviewModalError(t.reviewModalErrorRequired);
        return;
      }
      closeReviewActionModal({ confirmed: true, fields: { note } });
      return;
    }
    closeReviewActionModal({ confirmed: false, reason: 'invalid_action' });
  }

  function bindReviewActionModal() {
    const nodes = getReviewModalNodes();
    if (!nodes.root || nodes.root.dataset.gmReviewModalBound === '1') return;
    nodes.root.dataset.gmReviewModalBound = '1';

    const closeHandler = () => {
      closeReviewActionModal({ confirmed: false, reason: 'cancelled' });
    };
    if (nodes.backdrop) nodes.backdrop.addEventListener('click', closeHandler);
    if (nodes.cancelBtn) nodes.cancelBtn.addEventListener('click', closeHandler);
    if (nodes.closeBtn) nodes.closeBtn.addEventListener('click', closeHandler);
    if (nodes.submitBtn) {
      nodes.submitBtn.addEventListener('click', () => {
        submitReviewActionModal();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (!reviewModalState.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler();
      }
    });
  }

  function getReviewModalTitleByAction(action, t) {
    if (action === 'ajuste') return t.reviewModalTitleAjuste;
    if (action === 'revisao') return t.reviewModalTitleRevisao;
    if (action === 'encerramento') return t.reviewModalTitleEncerramento;
    if (action === 'descarte') return t.reviewModalTitleDescarte;
    return t.reviewModalTitleRevisao;
  }

  function getReviewModalSubmitLabelByAction(action, t) {
    if (action === 'ajuste') return t.reviewModalSubmitAjuste;
    if (action === 'revisao') return t.reviewModalSubmitRevisao;
    if (action === 'encerramento') return t.reviewModalSubmitEncerramento;
    if (action === 'descarte') return t.reviewModalSubmitDescarte;
    return t.reviewBtnLoading;
  }

  function openReviewActionModal(actionLike, itemLike, t, locale) {
    const action = normalizeKeyLite(actionLike);
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const nodes = getReviewModalNodes();
    if (!nodes.root) return Promise.resolve({ confirmed: false, reason: 'modal_missing' });

    const workflowId = String(item.workflowId || '').trim();
    const code = String(item.code || '--').trim() || '--';
    const reviewer = formatReviewerLabel(item.recommendedReviewer, locale, t);
    const statusText = workflowStatusText(item.status || '', t);
    const priorityText = reviewPriorityText(item.priority || 'none', t);
    const ownerDefault = String(item.ownerUser || getCurrentReviewUser()?.username || '').trim();
    const dueDefault = toLocalDateTimeInput(item.dueAt || buildDefaultDueAtIso(item.priority || 'medium'));
    const closeDefault = String(item?.decision?.result || '').trim();
    const closeModeDefault = closeDefault === 'encerrado_sem_acao' ? 'encerrado_sem_acao' : 'encerrado_com_acao';

    if (nodes.kicker) nodes.kicker.textContent = t.reviewModalKicker;
    if (nodes.title) nodes.title.textContent = getReviewModalTitleByAction(action, t);
    if (nodes.codeLbl) nodes.codeLbl.textContent = t.reviewModalCtxCodeLbl;
    if (nodes.statusLbl) nodes.statusLbl.textContent = t.reviewModalCtxStatusLbl;
    if (nodes.priorityLbl) nodes.priorityLbl.textContent = t.reviewModalCtxPriorityLbl;
    if (nodes.reviewerLbl) nodes.reviewerLbl.textContent = t.reviewModalCtxReviewerLbl;
    if (nodes.codeVal) nodes.codeVal.textContent = code;
    if (nodes.statusVal) nodes.statusVal.textContent = statusText;
    if (nodes.priorityVal) nodes.priorityVal.textContent = priorityText;
    if (nodes.reviewerVal) nodes.reviewerVal.textContent = reviewer;
    if (nodes.closeBtn) nodes.closeBtn.textContent = t.reviewModalClose;
    if (nodes.cancelBtn) nodes.cancelBtn.textContent = t.reviewModalCancel;
    if (nodes.submitBtn) nodes.submitBtn.textContent = getReviewModalSubmitLabelByAction(action, t);
    if (nodes.ownerLbl) nodes.ownerLbl.textContent = t.reviewModalOwnerLbl;
    if (nodes.dueLbl) nodes.dueLbl.textContent = t.reviewModalDueLbl;
    if (nodes.closeModeLbl) nodes.closeModeLbl.textContent = t.reviewModalCloseModeLbl;
    if (nodes.noteLbl) nodes.noteLbl.textContent = t.reviewModalNoteLbl;
    if (nodes.closeModeInput && nodes.closeModeInput.options.length >= 2) {
      nodes.closeModeInput.options[0].text = t.reviewModalCloseModeWithAction;
      nodes.closeModeInput.options[1].text = t.reviewModalCloseModeWithoutAction;
    }

    if (nodes.ownerWrap) nodes.ownerWrap.hidden = action !== 'revisao';
    if (nodes.dueWrap) nodes.dueWrap.hidden = action !== 'revisao';
    if (nodes.closeModeWrap) nodes.closeModeWrap.hidden = action !== 'encerramento';
    if (nodes.noteWrap) nodes.noteWrap.hidden = action === 'aceite';
    if (nodes.ownerInput) nodes.ownerInput.value = ownerDefault;
    if (nodes.dueInput) nodes.dueInput.value = dueDefault;
    if (nodes.closeModeInput) nodes.closeModeInput.value = closeModeDefault;
    if (nodes.noteInput) {
      nodes.noteInput.value = '';
      nodes.noteInput.placeholder = action === 'ajuste'
        ? t.reviewModalNotePlaceholderAjuste
        : (action === 'revisao'
          ? t.reviewModalNotePlaceholderRevisao
          : (action === 'encerramento'
            ? t.reviewModalNotePlaceholderEncerramento
            : t.reviewModalNotePlaceholderDescarte));
    }
    setReviewModalError('');

    reviewModalState.open = true;
    reviewModalState.action = action;
    reviewModalState.workflowId = workflowId;
    reviewModalState.item = { ...item };
    showReviewActionModal();

    setTimeout(() => {
      if (action === 'revisao' && nodes.ownerInput) {
        nodes.ownerInput.focus();
      } else if (nodes.noteInput && action !== 'aceite') {
        nodes.noteInput.focus();
      } else if (nodes.submitBtn) {
        nodes.submitBtn.focus();
      }
    }, 20);

    return new Promise((resolve) => {
      reviewModalState.resolver = resolve;
    });
  }

  async function buildReviewActionPayload(actionLike, itemLike, t) {
    const action = normalizeKeyLite(actionLike);
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : {};
    const payload = {
      action,
      expectedVersion: Math.max(1, Number(item.version || 1)),
      decision: {
        type: action
      }
    };
    let result = '';
    let note = '';

    if (action === 'aceite') {
      result = 'aprovado';
    } else {
      const locale = reviewWorkflowUiState.locale || getLanguageTag();
      const modalResult = await openReviewActionModal(action, item, t, locale);
      if (!modalResult || !modalResult.confirmed) return { ok: false, reason: 'cancelled' };
      const fields = (modalResult.fields && typeof modalResult.fields === 'object') ? modalResult.fields : {};

      if (action === 'ajuste') {
        note = String(fields.note || '').trim();
        if (!note) return { ok: false, reason: 'required' };
        payload.note = note;
        result = 'solicitar_ajuste';
      } else if (action === 'revisao') {
        const ownerUser = String(fields.ownerUser || '').trim();
        const dueAtIso = String(fields.dueAt || '').trim();
        note = String(fields.note || '').trim();
        if (!ownerUser || !note) return { ok: false, reason: 'required' };
        if (!dueAtIso) return { ok: false, reason: 'due_at_invalid' };
        payload.ownerUser = ownerUser;
        payload.dueAt = dueAtIso;
        payload.note = note;
        result = 'aprovado';
      } else if (action === 'encerramento') {
        note = String(fields.note || '').trim();
        result = String(fields.closeResult || '').trim() === 'encerrado_sem_acao'
          ? 'encerrado_sem_acao'
          : 'encerrado_com_acao';
        if (note) payload.note = note;
      } else if (action === 'descarte') {
        note = String(fields.note || '').trim();
        if (!note) return { ok: false, reason: 'required' };
        payload.note = note;
        result = 'nao_procede';
      } else {
        return { ok: false, reason: 'invalid_action' };
      }
    }

    if (action === 'ajuste' && !result) {
      result = 'solicitar_ajuste';
    }

    if (result) {
      payload.result = result;
      payload.decision.result = result;
    }
    if (note) {
      payload.decision.observation = note;
    }
    return { ok: true, payload };
  }

  function applyWorkflowItemToState(itemLike, summaryLike) {
    const item = (itemLike && typeof itemLike === 'object') ? itemLike : null;
    if (!item) return;
    const workflowId = String(item.workflowId || '').trim();
    if (!workflowId) return;
    const detailed = ensureReviewDetailedState();
    const queue = Array.isArray(detailed.reviewQueue) ? detailed.reviewQueue.slice() : [];
    const idx = queue.findIndex((row) => String(row?.workflowId || '').trim() === workflowId);
    if (idx >= 0) queue[idx] = { ...queue[idx], ...item };
    else queue.push({ ...item });
    detailed.reviewQueue = queue;
    mergeReviewSummaryIntoDetailed(summaryLike);
    syncReviewGuidedHeaderFromQueue();
  }

  function applyWorkflowSnapshotToState(snapshotLike) {
    const payload = (snapshotLike && typeof snapshotLike === 'object') ? snapshotLike : {};
    const items = Array.isArray(payload.items) ? payload.items.map((row) => ({ ...row })) : [];
    const detailed = ensureReviewDetailedState();
    detailed.reviewQueue = items;
    mergeReviewSummaryIntoDetailed(payload.summary || {});
    syncReviewGuidedHeaderFromQueue();
  }

  async function reloadWorkflowQueuePartial() {
    const dateKey = String(reviewWorkflowUiState.dateKey || activeDate() || '').trim();
    if (!dateKey) return false;
    const periodType = String(reviewWorkflowUiState.periodType || 'daily').toLowerCase() === 'monthly' ? 'monthly' : 'daily';
    const locale = reviewWorkflowUiState.locale || getLanguageTag();
    const params = new URLSearchParams();
    params.set('periodType', periodType);
    params.set('limit', '240');
    params.set('sync', '0');
    const response = await fetch(withAuth(`/api/review-queue/workflow/${encodeURIComponent(dateKey)}?${params.toString()}`), {
      cache: 'no-store',
      headers: {
        'x-panel-lang': locale
      }
    });
    if (!response.ok) throw new Error(`review_queue_reload_failed_${response.status}`);
    const payload = await response.json();
    applyWorkflowSnapshotToState(payload);
    renderGuidedReviewFromState();
    return true;
  }

  async function handleReviewQueueAction(workflowIdLike, actionLike) {
    const workflowId = String(workflowIdLike || '').trim();
    const action = normalizeKeyLite(actionLike);
    if (!workflowId || !action) return;
    if (reviewWorkflowUiState.pendingByWorkflow.has(workflowId)) return;

    const locale = reviewWorkflowUiState.locale || getLanguageTag();
    const t = getTaxonomyTexts(locale);
    const item = findReviewQueueItemByWorkflowId(workflowId);
    if (!item) {
      safeNotify(t.reviewErrorLoadQueue);
      return;
    }

    const currentUser = getCurrentReviewUser();
    const allowed = getReviewAllowedActions(item, currentUser);
    if (!allowed.includes(action)) {
      safeNotify(t.reviewErrorForbidden);
      return;
    }

    const built = await buildReviewActionPayload(action, item, t);
    if (!built.ok) {
      if (built.reason === 'cancelled') return;
      safeNotify(built.reason === 'due_at_invalid' ? t.reviewInvalidDueAt : t.reviewInvalidRequired);
      return;
    }

    reviewWorkflowUiState.pendingByWorkflow.set(workflowId, action);
    renderGuidedReviewFromState();

    try {
      const response = await fetch(withAuth(`/api/review-queue/workflow/${encodeURIComponent(workflowId)}`), {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-panel-lang': locale
        },
        body: JSON.stringify(built.payload)
      });

      if (response.status === 403) {
        safeNotify(t.reviewErrorForbidden);
        return;
      }
      if (response.status === 409) {
        safeNotify(t.reviewConflictReloading);
        try {
          await reloadWorkflowQueuePartial();
          safeNotify(t.reviewErrorConflict);
        } catch (_) {
          safeNotify(t.reviewErrorLoadQueue);
        }
        return;
      }
      if (!response.ok) {
        safeNotify(t.reviewErrorGeneric);
        return;
      }

      const payload = await response.json();
      applyWorkflowItemToState(payload?.item, payload?.summary);
      renderGuidedReviewFromState();
      safeNotify(t.reviewSuccessAction);
    } catch (_) {
      safeNotify(t.reviewErrorGeneric);
    } finally {
      reviewWorkflowUiState.pendingByWorkflow.delete(workflowId);
      renderGuidedReviewFromState();
    }
  }

  function bindReviewQueueActions() {
    const box = document.getElementById('gmTaxReviewQueueList');
    if (!box || box.dataset.reviewActionsBound === '1') return;
    box.dataset.reviewActionsBound = '1';
    box.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button[data-review-action][data-workflow-id]');
      if (!button) return;
      if (button.disabled) return;
      const workflowId = String(button.getAttribute('data-workflow-id') || '').trim();
      const action = String(button.getAttribute('data-review-action') || '').trim();
      handleReviewQueueAction(workflowId, action).catch(() => {});
    });
  }

  function renderGuidedReview(detailed, quality, locale, t) {
    const safeDetailed = (detailed && typeof detailed === 'object') ? detailed : {};
    const summary = (safeDetailed.reviewQueueSummary && typeof safeDetailed.reviewQueueSummary === 'object')
      ? safeDetailed.reviewQueueSummary
      : {};
    const workflowSummary = (summary.workflow && typeof summary.workflow === 'object')
      ? summary.workflow
      : {};
    const queue = orderReviewQueueItems(Array.isArray(safeDetailed.reviewQueue) ? safeDetailed.reviewQueue : []);
    const topItem = queue[0] || null;
    const priorityKey = normalizeReviewPriority(
      safeDetailed.reviewPriority || topItem?.priority || getHighestPriorityFromQueue(queue)
    );
    const reviewReason = String(safeDetailed.reviewReason || topItem?.reviewReason || t.reviewNoReason || '').trim();
    const reviewer = formatReviewerLabel(
      safeDetailed.recommendedReviewer || topItem?.recommendedReviewer || 'monitoramento_automatico',
      locale,
      t
    );
    const checklistRows = (Array.isArray(safeDetailed.reviewChecklist) && safeDetailed.reviewChecklist.length
      ? safeDetailed.reviewChecklist
      : (Array.isArray(topItem?.reviewChecklist) ? topItem.reviewChecklist : []))
      .slice(0, 4)
      .map((line, index) => ({ title: `${index + 1}.`, detail: line }));

    const total = Number(workflowSummary.total ?? summary.total ?? queue.length ?? 0);
    const open = Number(workflowSummary.open ?? queue.filter((item) => !isWorkflowClosedStatus(item?.status)).length ?? 0);
    const overdue = Number(workflowSummary.overdue ?? queue.filter((item) => isReviewItemOverdue(item)).length ?? 0);
    const byStatus = (workflowSummary.byStatus && typeof workflowSummary.byStatus === 'object')
      ? workflowSummary.byStatus
      : {};
    const highestPriority = normalizeReviewPriority(getHighestPriorityFromQueue(queue) || priorityKey);
    const nextDueAtIso = workflowSummary.nextDueAt || getNextDueAtFromQueue(queue);
    const nextDueAtText = nextDueAtIso ? formatDateTimeLocal(nextDueAtIso, locale) : t.reviewNoDueAt;
    const topStatusText = workflowStatusText(topItem?.status, t);
    const topDueAtText = topItem?.dueAt ? formatDateTimeLocal(topItem.dueAt, locale) : t.reviewNoDueAt;
    const topImpact = String(topItem?.impact || '').trim();
    const topDueAtWithOverdue = topItem && isReviewItemOverdue(topItem)
      ? `${topDueAtText} • ${t.reviewOverdueBadge}`
      : topDueAtText;

    setReviewPriorityVisual(priorityKey);
    setText('gmTaxReviewPriority', reviewPriorityText(priorityKey, t));
    setText('gmTaxReviewReviewer', reviewer);
    setText('gmTaxReviewStatus', topStatusText);
    setText('gmTaxReviewDueAt', topDueAtWithOverdue);
    setText('gmTaxReviewReason', reviewReason || t.reviewNoReason);
    setText('gmTaxReviewImpact', `${t.reviewImpactLabel}: ${topImpact || '--'}`);

    setText('gmTaxReviewTotal', total);
    setText('gmTaxReviewOpen', open);
    setText('gmTaxReviewOverdue', overdue);
    setText('gmTaxReviewByStatus', formatReviewStatusCompact(byStatus, t));
    setText('gmTaxReviewHighestPriority', reviewPriorityText(highestPriority, t));
    setText('gmTaxReviewNextDueAt', nextDueAtText);

    renderTaxList('gmTaxReviewChecklistList', checklistRows, t.reviewNoChecklistTitle, t.reviewNoChecklistText);
    renderReviewQueueList('gmTaxReviewQueueList', queue, locale, t);
  }

  function formatSignedNumber(valueLike, locale, decimalsLike) {
    const value = Number(valueLike || 0);
    const decimals = Number.isFinite(Number(decimalsLike)) ? Number(decimalsLike) : 1;
    const tag = locale === 'en-US' ? 'en-US' : 'pt-BR';
    if (!Number.isFinite(value) || value === 0) return `0${decimals > 0 ? `.${'0'.repeat(decimals)}` : ''}`;
    const signal = value > 0 ? '+' : '';
    return `${signal}${value.toLocaleString(tag, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }

  function getHistoricalAttachment(payload, detailed) {
    const direct = (payload?.historicalIntelligence && typeof payload.historicalIntelligence === 'object')
      ? payload.historicalIntelligence
      : {};
    const fromDetailed = (detailed && typeof detailed === 'object') ? detailed : {};
    return {
      clients: (direct.clients && typeof direct.clients === 'object')
        ? direct.clients
        : (fromDetailed.clientIntelligence || {}),
      technicians: (direct.technicians && typeof direct.technicians === 'object')
        ? direct.technicians
        : (fromDetailed.technicianIntelligence || {}),
      comparatives: (direct.comparatives && typeof direct.comparatives === 'object')
        ? direct.comparatives
        : (fromDetailed.comparatives || {}),
      laudo: (direct.laudoStandards && typeof direct.laudoStandards === 'object')
        ? direct.laudoStandards
        : (fromDetailed.laudoStandards || {})
    };
  }

  function renderHistoricalClients(clientsLike, locale, t) {
    const clients = (clientsLike && typeof clientsLike === 'object') ? clientsLike : {};
    const summary = (clients.summary && typeof clients.summary === 'object') ? clients.summary : {};
    const byStatus = (summary.byStatus && typeof summary.byStatus === 'object') ? summary.byStatus : {};
    const opportunities = Array.isArray(clients.opportunities) ? clients.opportunities : [];
    const criticalCommercial = Number(byStatus.critico_comercial || 0);

    setText('gmHistClientsTotal', Number(summary.totalClients || 0));
    setText('gmHistClientsOpportunity', Number(byStatus.oportunidade || 0) + criticalCommercial);
    setText('gmHistClientsAlert', Number(byStatus.alerta || 0));
    setText('gmHistClientsAttention', Number(byStatus.atencao || 0));

    const rows = opportunities.slice(0, 5).map((item) => ({
      title: item?.cnpj ? `${item?.clientName || '--'} (${item.cnpj})` : (item?.clientName || '--'),
      detail: `${t.histClientDaysNoCall}: ${Number(item?.daysWithoutService || 0)} | ${t.histClientRecurrence}: ${formatPct(item?.recurrenceRatePct || 0, locale, 1)} | Status: ${String(item?.status || '--')} | ${t.histClientRecommendation}: ${String(item?.recommendation || '--')}`
    }));
    renderTaxList('gmHistClientsList', rows, t.histNoClientsTitle, t.histNoClientsText);
  }

  function renderHistoricalTechnicians(techniciansLike, locale, t) {
    const technicians = (techniciansLike && typeof techniciansLike === 'object') ? techniciansLike : {};
    const summary = (technicians.summary && typeof technicians.summary === 'object') ? technicians.summary : {};
    const ranking = Array.isArray(technicians.ranking) ? technicians.ranking : [];
    const top = ranking[0] || null;

    setText('gmHistTechTotal', Number(summary.totalTechnicians || 0));
    setText('gmHistTechAvgScore', Number(summary.avgTechnicalScore || 0).toLocaleString(locale === 'en-US' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    setText('gmHistTechLowConf', Number(summary.lowConfidenceTechnicians || 0));
    setText('gmHistTechTop', top?.technicianName || '--');
    const missingTech = Math.max(
      0,
      Number(lastInsightsPayload?.historicalIntelligence?.normalization?.issues?.missingTechnician || 0)
    );
    setText('gmHistTechMissing', missingTech);

    const box = document.getElementById('gmHistTechniciansBox');
    if (box) {
      const nextShowAll = box.dataset.gmShowAll === '1';
      histTechniciansShowAll = nextShowAll;
    }
    const limit = histTechniciansShowAll ? ranking.length : HIST_TECH_RANK_DEFAULT_LIMIT;
    const rows = ranking
      .filter((item) => {
        const name = String(item?.technicianName || '').trim();
        return !!name;
      })
      .slice(0, limit)
      .map((item) => {
      const narrative = (item?.narrative && typeof item.narrative === 'object') ? item.narrative : {};
      const action = Array.isArray(narrative.actions) && narrative.actions.length
        ? narrative.actions[0]
        : '--';
      return {
        col1: String(item?.technicianName || '').trim() || (t?.histTechUnknown || (locale === 'en-US' ? 'Unidentified technician' : 'Técnico não identificado')),
        col2: Number(item?.technicalScore || 0).toLocaleString(locale === 'en-US' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        col3: formatPct(item?.returnRatePct || 0, locale, 1),
        col4: action
      };
    });
    renderTaxTableBody('gmHistTechniciansTableBody', rows, t.histNoTechTitle);

    const toggleBtn = document.getElementById('gmHistTechniciansToggleBtn');
    if (toggleBtn) {
      const canToggle = ranking.length > HIST_TECH_RANK_DEFAULT_LIMIT;
      toggleBtn.hidden = !canToggle;
      toggleBtn.textContent = histTechniciansShowAll
        ? (t?.histTechCollapse || 'Ver menos')
        : (t?.histTechShowAll ? t.histTechShowAll.replace('{count}', String(ranking.length)) : `Ver todos (${ranking.length})`);
      if (toggleBtn.dataset.gmBound !== '1') {
        toggleBtn.dataset.gmBound = '1';
        toggleBtn.addEventListener('click', () => {
          const host = document.getElementById('gmHistTechniciansBox');
          const next = !(host && host.dataset.gmShowAll === '1');
          if (host) host.dataset.gmShowAll = next ? '1' : '0';
          histTechniciansShowAll = next;
          renderHistoricalTechnicians(techniciansLike, locale, t);
        });
      }
    }
  }

  function formatHistoricalPeriodContext(payloadLike, locale) {
    const payload = (payloadLike && typeof payloadLike === 'object') ? payloadLike : {};
    const hist = (payload.historicalIntelligence && typeof payload.historicalIntelligence === 'object') ? payload.historicalIntelligence : {};
    const periodType = String(hist?.technicians?.period?.type || '').trim().toLowerCase();
    const referenceDate = String(hist?.technicians?.period?.referenceDate || payload?.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return '--';
    const y = referenceDate.slice(0, 4);
    const m = Number(referenceDate.slice(5, 7));
    if (periodType === 'quarterly') {
      const q = Math.floor((m - 1) / 3) + 1;
      const qLabel = locale === 'en-US' ? `Q${q}/${y}` : `${q}º trimestre/${y}`;
      return qLabel;
    }
    if (periodType === 'ytd') {
      return locale === 'en-US' ? `Year ${y}` : `Ano ${y}`;
    }
    if (periodType === 'historical') {
      return locale === 'en-US' ? 'Full history' : 'Histórico completo';
    }
    const dt = new Date(`${referenceDate.slice(0, 7)}-01T00:00:00`);
    const monthLabel = Number.isNaN(dt.getTime())
      ? `${referenceDate.slice(5, 7)}/${y}`
      : new Intl.DateTimeFormat(locale === 'en-US' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' }).format(dt);
    return monthLabel;
  }

  function renderHistoricalComparatives(comparativesLike, locale, t) {
    const comparatives = (comparativesLike && typeof comparativesLike === 'object') ? comparativesLike : {};
    const automatic = (comparatives.automatic && typeof comparatives.automatic === 'object') ? comparatives.automatic : {};
    const mapping = [
      { key: 'monthVsPreviousYear', label: t.histComparativeMonth },
      { key: 'quarterVsPreviousYear', label: t.histComparativeQuarter },
      { key: 'ytdVsPreviousYear', label: t.histComparativeYtd }
    ];
    const rows = mapping.map((item) => {
      const bucket = (automatic[item.key] && typeof automatic[item.key] === 'object') ? automatic[item.key] : {};
      const current = (bucket.current && typeof bucket.current === 'object') ? bucket.current : {};
      const reference = (bucket.reference && typeof bucket.reference === 'object') ? bucket.reference : {};
      const delta = (bucket.delta && typeof bucket.delta === 'object') ? bucket.delta : {};
      const deltaOs = (delta.totalOs && typeof delta.totalOs === 'object') ? delta.totalOs : {};
      if (!Object.keys(bucket).length) return null;
      return {
        title: item.label,
        detail: `${current.totalOs || 0} vs ${reference.totalOs || 0} ${t.woUnit} | ${t.histComparativeDelta}: ${formatSignedNumber(deltaOs.abs || 0, locale, 0)} (${formatSignedNumber(deltaOs.pct || 0, locale, 1)}%)`
      };
    }).filter(Boolean);
    renderTaxList('gmHistComparativesList', rows, t.histNoComparativesTitle, t.histNoComparativesText);
  }

  function renderHistoricalLaudo(laudoLike, locale, t) {
    const laudo = (laudoLike && typeof laudoLike === 'object') ? laudoLike : {};
    const compliance = (laudo.compliance && typeof laudo.compliance === 'object') ? laudo.compliance : {};
    const official = (laudo.officialStandard && typeof laudo.officialStandard === 'object') ? laudo.officialStandard : {};
    const recommendations = Array.isArray(laudo.recommendations) ? laudo.recommendations : [];
    const goldenRules = Array.isArray(official.goldenRules) ? official.goldenRules : [];
    const qualityLevel = String(compliance.qualityLevel || '').toLowerCase();

    const box = document.getElementById('gmHistLaudoBox');
    if (box) box.classList.toggle('is-low-quality', qualityLevel === 'low');

    setText('gmHistLaudoScore', formatPct(compliance.qualityScore || 0, locale, 1));
    setText('gmHistLaudoLevel', taxonomyValueLabel('quality', qualityLevel || 'low', locale));
    setText('gmHistLaudoMissingAction', formatPct(compliance.missingActionRatePct || 0, locale, 1));
    setText('gmHistLaudoMissingConclusion', formatPct(compliance.missingConclusionRatePct || 0, locale, 1));

    const rows = [];
    if (goldenRules.length) {
      rows.push({
        title: t.histLaudoRule,
        detail: goldenRules[0]
      });
    }
    if (recommendations.length) {
      rows.push({
        title: t.histLaudoRecommendation,
        detail: recommendations[0]
      });
    }
    const examples = Array.isArray(compliance.examples) ? compliance.examples : [];
    if (examples.length) {
      const ex = examples[0];
      rows.push({
        title: `${t.reviewEvidenceLabel}: ${ex.os || '--'}`,
        detail: `${t.histLaudoMissingAction}: ${ex.hasAction ? 'OK' : 'NOK'} | ${t.histLaudoMissingConclusion}: ${ex.hasConclusion ? 'OK' : 'NOK'}`
      });
    }
    renderTaxList('gmHistLaudoList', rows, t.histNoLaudoTitle, t.histNoLaudoText);
  }

  function renderHistoricalLayers(payload, detailed, locale, t) {
    const hist = getHistoricalAttachment(payload, detailed);
    renderHistoricalClients(hist.clients, locale, t);
    renderHistoricalTechnicians(hist.technicians, locale, t);
    renderHistoricalComparatives(hist.comparatives, locale, t);
    renderHistoricalLaudo(hist.laudo, locale, t);
  }

  function buildTaxonomyAlerts(detailed, locale) {
    const t = getTaxonomyTexts(locale);
    const quality = detailed?.classificationQuality || {};
    const summary = detailed?.taxonomySummary || {};
    const alerts = [];
    const unknownPct = Number(quality.percentNaoIdentificado || 0);
    const undefinedPct = Number(quality.percentIndefinido || 0);
    const avgConfidence = Number(quality.avgConfidencePct || 0);

    if (unknownPct >= 25) {
      alerts.push({
        title: `${t.actionRequired}: ${t.qualityUnknown}`,
        detail: `${formatPct(unknownPct, locale, 1)} (${t.monitor})`
      });
    }
    if (undefinedPct >= 20) {
      alerts.push({
        title: `${t.actionRequired}: ${taxonomyValueLabel('probableCause', 'indefinido', locale)}`,
        detail: `${formatPct(undefinedPct, locale, 1)} (${t.monitor})`
      });
    }
    if (avgConfidence < 60) {
      alerts.push({
        title: `${t.actionRequired}: ${t.avgConfidence}`,
        detail: `${formatPct(avgConfidence, locale, 1)}`
      });
    }

    const outcomes = Array.isArray(summary.outcomeType) ? summary.outcomeType : [];
    const pendingOutcome = outcomes
      .filter((item) => ['requer_peca', 'requer_fabrica', 'requer_cliente', 'requer_nova_visita'].includes(item.key))
      .reduce((acc, item) => acc + Number(item.count || 0), 0);
    if (pendingOutcome > 0) {
      alerts.push({
        title: `${t.actionRequired}: ${taxonomyValueLabel('outcomeType', 'requer_nova_visita', locale)}`,
        detail: `${pendingOutcome} ${t.woUnit}`
      });
    }

    if (!alerts.length) {
      alerts.push({
        title: t.noAlerts,
        detail: formatPct(Number(quality.coveragePct || 0), locale, 1)
      });
    }
    return alerts.slice(0, 4);
  }

  function renderTaxonomy(payload) {
    const renderLabel = '[PERF][AI-TECH] render_analise_tecnica';
    perfTime(renderLabel);
    const renderStart = performance.now();
    const locale = payload?.locale || getLanguageTag();
    const t = getTaxonomyTexts(locale);
    setTaxonomyStaticTexts(locale);
    bindAnalyticsTabs();
    if (activeAnalyticsTab === 'trimestral' || activeModuleKey === 'comparativos') {
      refreshQuarterlyExecutivePanel({ forceReload: false }).catch(() => {});
    }

    const picked = pickDetailedAnalytics(payload);
    const detailed = picked.detailed || null;
    const summary = detailed?.taxonomySummary || null;
    const quality = detailed?.classificationQuality || {};
    const narrativeData = detailed?.technicalNarrativeV2 || {};
    const qualityLevel = String(quality.classificationQuality || summary?.classificationQuality || '').toLowerCase() || 'low';
    const activeDateKey = String(payload?.date || activeDate() || '').trim();
    const detailedPeriod = (detailed?.period && typeof detailed.period === 'object') ? detailed.period : {};
    reviewWorkflowUiState.dateKey = activeDateKey;
    reviewWorkflowUiState.locale = locale;
    const workflowScope = String(detailedPeriod.type || picked.scope || 'daily').toLowerCase();
    reviewWorkflowUiState.periodType = ['monthly', 'quarterly', 'historical', 'ytd'].includes(workflowScope) ? 'monthly' : 'daily';
    reviewWorkflowUiState.referenceDate = String(detailedPeriod.referenceDate || activeDateKey || '').trim();
    reviewWorkflowUiState.quality = deepCloneObject(quality, {});
    reviewWorkflowUiState.detailed = buildReviewDetailedState(detailed || {});
    ensureReviewDetailedState();
    syncReviewGuidedHeaderFromQueue();

    setText('gmTaxonomyPeriod', `${t.periodLabel}: ${picked.period || '--'}`);
    const scopeValue = String(picked.scope || '').toLowerCase();
    const scopeLabel = scopeValue === 'monthly'
      ? t.scopeMonthly
      : (scopeValue === 'quarterly'
        ? (t.scopeQuarterly || t.tabQuarterly)
        : (scopeValue === 'historical'
          ? (t.scopeHistorical || t.scopeMonthly)
          : t.scopeDaily));
    setText('gmTaxonomyScope', `${t.scopeLabel}: ${scopeLabel}`);
    setQualityVisualPriority(qualityLevel);

    if (!summary || Number(summary.totalOs || 0) <= 0) {
      setQualityVisualPriority('medium');
      setText('gmTaxPrioritySeverity', '--');
      setText('gmTaxPriorityRisk', '--');
      setText('gmTaxPriorityAction', t.noActionAvailable);
      setText('gmTaxTotalOs', '0');
      setText('gmTaxTopService', '--');
      setText('gmTaxTopServiceRate', '0%');
      setText('gmTaxCoverage', '0%');
      setText('gmTaxCoverageSub', `${t.qualityUnknown}: 0%`);
      setText('gmTaxQuality', '--');
      setText('gmTaxQualitySub', `${t.qualityAvg}: 0%`);
      setText('gmTaxNarrativeSummary', t.noDataNarrative);
      setText('gmTaxQualityLevel', '--');
      setText('gmTaxAvgConfidence', '0%');
      setText('gmTaxCoverageExternal', '0%');
      setText('gmTaxUnknownUndefined', '0% / 0%');
      renderTaxBarChart('gmTaxServiceChart', [], t.noDataServiceChart);
      renderTaxTableBody('gmTaxEquipmentTableBody', [], t.noBaseTitle);
      renderEquipmentIntelSummary('gmEquipmentIntelSummary', {}, [], locale);
      renderEquipmentIntelList('gmEquipmentIntelList', [], locale, equipmentFallbackText(locale, 'waiting'));
      renderTaxTableBody('gmTaxTechnicianTableBody', [], t.noBaseTitle);
      renderTaxBarChart('gmTaxEquipmentParetoChart', [], t.noDataPareto);
      renderTaxList('gmTaxAlertsList', [], t.noAlertsTitle, t.noDataAlert);
      renderTaxList('gmTaxFindingsList', [], t.noFindingsTitle, t.noDataFindings);
      renderTaxList('gmTaxRecommendationsList', [], t.noRecommendationsTitle, t.noDataRecommendations);
      renderTaxList('gmTaxAxisList', [], t.axisTitle, t.noDataAxis);
      renderTaxBarChart('gmTaxAxisQualityChart', [], t.noDataAxis, (row) => valueToneByPct(row.value));
      reviewWorkflowUiState.detailed = {};
      ensureReviewDetailedState();
      syncReviewGuidedHeaderFromQueue();
      renderGuidedReviewFromState();
      renderHistoricalLayers(payload, detailed || {}, locale, t);
      perfTimeEnd(renderLabel);
      perfInfo('[PERF][AI-TECH] render_analise_tecnica_empty_ms=' + Math.round(performance.now() - renderStart));
      return;
    }

    const topService = getFirstDistributionEntry(summary.serviceType);
    const topCause = getFirstDistributionEntry(summary.probableCause);
    const outcomes = Array.isArray(summary.outcomeType) ? summary.outcomeType : [];
    const pendingOutcomes = outcomes
      .filter((item) => ['requer_peca', 'requer_fabrica', 'requer_cliente', 'requer_nova_visita'].includes(item.key))
      .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
    const pendingOutcomeTotal = pendingOutcomes.reduce((acc, item) => acc + Number(item.count || 0), 0);
    const riskLabel = pendingOutcomes.length
      ? taxonomyValueLabel('outcomeType', pendingOutcomes[0].key, locale)
      : taxonomyValueLabel('probableCause', topCause?.key || 'indefinido', locale);
    const severityKey = resolvePrioritySeverity(qualityLevel, quality, pendingOutcomeTotal);
    const firstRecommendation = Array.isArray(narrativeData.recommendedActions) ? narrativeData.recommendedActions[0] : '';
    const firstAlert = buildTaxonomyAlerts(detailed, locale)[0];
    const actionTextRaw = String(firstRecommendation || firstAlert?.detail || firstAlert?.title || t.noActionAvailable);
    const actionText = actionTextRaw.length > 120 ? `${actionTextRaw.slice(0, 117)}...` : actionTextRaw;
    setText('gmTaxPrioritySeverity', severityLabel(severityKey, t));
    setText('gmTaxPriorityRisk', pendingOutcomeTotal > 0 ? `${riskLabel} (${pendingOutcomeTotal} ${t.woUnit})` : riskLabel);
    setText('gmTaxPriorityAction', actionText);
    setText('gmTaxTotalOs', Number(summary.totalOs || 0));
    setText('gmTaxTopService', taxonomyValueLabel('serviceType', topService?.key || 'nao_identificado', locale));
    setText('gmTaxTopServiceRate', formatPct(topService?.ratePct || 0, locale, 1));
    setText('gmTaxCoverage', formatPct(quality.coveragePct || 0, locale, 1));
    setText('gmTaxCoverageSub', `${t.qualityUnknown}: ${formatPct(quality.percentNaoIdentificado || 0, locale, 1)}`);
    setText('gmTaxQuality', taxonomyValueLabel('quality', qualityLevel, locale));
    setText('gmTaxQualitySub', `${t.qualityAvg}: ${formatPct(quality.avgConfidencePct || 0, locale, 1)}`);

    const serviceRows = (Array.isArray(summary.serviceType) ? summary.serviceType : [])
      .slice(0, 5)
      .map((row) => ({
        name: taxonomyValueLabel('serviceType', row?.key || 'nao_identificado', locale),
        value: Number(row?.count || 0),
        label: `${Number(row?.count || 0)} | ${formatPct(row?.ratePct || 0, locale, 1)}`
      }));
    renderTaxBarChart('gmTaxServiceChart', serviceRows, t.noDataServiceChart);

    /*
    const equipmentRows = (Array.isArray(detailed.taxonomyByEquipment) ? detailed.taxonomyByEquipment : []).slice(0, 5).map((row) => {
      const topCause = getFirstDistributionEntry(row?.probableCause);
      const topOutcome = getFirstDistributionEntry(row?.outcomeType);
      return {
        title: row?.equipment || '--',
        detail: `${Number(row?.totalOs || 0)} ${t.woUnit} · ${t.topCause}: ${taxonomyValueLabel('probableCause', topCause?.key || 'indefinido', locale)} · ${t.topOutcome}: ${taxonomyValueLabel('outcomeType', topOutcome?.key || 'indefinido', locale)}`
      };
    });

    const technicianRows = (Array.isArray(detailed.taxonomyByTechnician) ? detailed.taxonomyByTechnician : []).slice(0, 5).map((row) => {
      const topServiceRow = getFirstDistributionEntry(row?.serviceType);
      const topOutcome = getFirstDistributionEntry(row?.outcomeType);
      return {
        title: row?.technician || '--',
        detail: `${Number(row?.totalOs || 0)} ${t.woUnit} · ${taxonomyValueLabel('serviceType', topServiceRow?.key || 'nao_identificado', locale)} · ${taxonomyValueLabel('outcomeType', topOutcome?.key || 'indefinido', locale)}`
      };
    });

    */
    renderTaxList('gmTaxAlertsList', buildTaxonomyAlerts(detailed, locale), t.noAlertsTitle, t.noDataAlert);

    const equipmentSource = Array.isArray(detailed.taxonomyByEquipment) ? detailed.taxonomyByEquipment : [];
    const technicianSource = Array.isArray(detailed.taxonomyByTechnician) ? detailed.taxonomyByTechnician : [];
    try {
      const coverage = (detailed.auditCoverage && typeof detailed.auditCoverage === 'object') ? detailed.auditCoverage : {};
      console.info('[OS AUDIT UI]', {
        scope: picked.scope || 'daily',
        period: picked.period || '',
        totalOs: Number(summary.totalOs || 0),
        baseTotalOs: Number(detailed?.base?.totalOs || 0),
        analyzedItems: Number(detailed?.base?.analyzedItems || coverage.totalAnalyzedItems || 0),
        taxonomyByEquipmentRows: equipmentSource.length,
        missingEquipmentCount: Number(detailed?.base?.missingEquipmentCount || coverage.missingEquipmentCount || 0),
        ignoredItems: Number(coverage.ignoredItems || 0),
        limitedByTopN: coverage.limitedByTopN === true
      });
    } catch (_) {}
    const equipmentTableRows = equipmentSource.slice(0, 5).map((row) => {
      const topCauseEntry = getFirstDistributionEntry(row?.probableCause);
      const topOutcomeEntry = getFirstDistributionEntry(row?.outcomeType);
      return {
        col1: row?.equipment || '--',
        col2: String(Number(row?.totalOs || 0)),
        col3: taxonomyValueLabel('probableCause', topCauseEntry?.key || 'indefinido', locale),
        col4: taxonomyValueLabel('outcomeType', topOutcomeEntry?.key || 'indefinido', locale)
      };
    });
    const technicianTableRows = technicianSource.slice(0, 5).map((row) => {
      const topServiceEntry = getFirstDistributionEntry(row?.serviceType);
      const topOutcomeEntry = getFirstDistributionEntry(row?.outcomeType);
      return {
        col1: row?.technician || '--',
        col2: String(Number(row?.totalOs || 0)),
        col3: taxonomyValueLabel('serviceType', topServiceEntry?.key || 'nao_identificado', locale),
        col4: taxonomyValueLabel('outcomeType', topOutcomeEntry?.key || 'indefinido', locale)
      };
    });
    const paretoRows = equipmentSource.slice(0, 6).map((row) => ({
      name: row?.equipment || '--',
      value: Number(row?.totalOs || 0),
      label: `${Number(row?.totalOs || 0)}`
    }));
    renderTaxTableBody('gmTaxEquipmentTableBody', equipmentTableRows, t.noDataEq);
    renderEquipmentIntelSummary('gmEquipmentIntelSummary', detailed, equipmentSource, locale);
    renderEquipmentIntelListProgressive(equipmentSource, locale, equipmentFallbackText(locale, 'waiting'));
    renderClassificationReview(detailed, equipmentSource, locale);
    renderTaxTableBody('gmTaxTechnicianTableBody', technicianTableRows, t.noDataTech);
    renderTaxBarChart('gmTaxEquipmentParetoChart', paretoRows, t.noDataPareto);

    setText('gmTaxNarrativeSummary', narrativeData.summary || t.noDataNarrative);

    const highlights = (Array.isArray(narrativeData.highlights) ? narrativeData.highlights : []).map((item, idx) => ({
      title: `${idx + 1}.`,
      detail: item
    }));
    const recommendations = (Array.isArray(narrativeData.recommendedActions) ? narrativeData.recommendedActions : []).map((item, idx) => ({
      title: `${idx + 1}.`,
      detail: item
    }));
    renderTaxList('gmTaxFindingsList', highlights, t.noFindingsTitle, t.noDataFindings);
    renderTaxList('gmTaxRecommendationsList', recommendations, t.noRecommendationsTitle, t.noDataRecommendations);
    renderGuidedReviewFromState();
    renderHistoricalLayers(payload, detailed, locale, t);

    setText('gmTaxQualityLevel', taxonomyValueLabel('quality', qualityLevel, locale));
    setText('gmTaxAvgConfidence', formatPct(quality.avgConfidencePct || 0, locale, 1));
    setText('gmTaxCoverageExternal', formatPct(quality.coveragePct || 0, locale, 1));
    setText('gmTaxUnknownUndefined', `${formatPct(quality.percentNaoIdentificado || 0, locale, 1)} / ${formatPct(quality.percentIndefinido || 0, locale, 1)}`);

    const axis = quality.axisQuality || {};
    const axisRows = Object.keys(axis).map((axisKey) => {
      const item = axis[axisKey] || {};
      const pctValue = Number(item.naoIdentificadoPct ?? item.indefinidoPct ?? 0);
      const axisLabel = getAxisLabel(axisKey, t);
      return {
        title: axisLabel,
        detail: formatPct(pctValue, locale, 1),
        axis: axisKey,
        value: pctValue
      };
    });
    axisRows.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
    renderTaxList('gmTaxAxisList', axisRows, t.axisTitle, t.noDataAxis);
    renderTaxBarChart(
      'gmTaxAxisQualityChart',
      axisRows.map((row) => ({ name: row.title, value: row.value, label: row.detail })),
      t.noDataAxis,
      (row) => valueToneByPct(row.value)
    );
    perfTimeEnd(renderLabel);
    perfInfo('[PERF][AI-TECH] render_analise_tecnica_done_ms=' + Math.round(performance.now() - renderStart));
  }

  function normalizeAlertText(itemLike) {
    if (itemLike == null) return '';
    if (typeof itemLike === 'string') return itemLike.trim();
    if (typeof itemLike === 'object') {
      const title = String(itemLike.title || itemLike.code || '').trim();
      const detail = String(itemLike.description || itemLike.detail || '').trim();
      if (title && detail) return `${title}: ${detail}`;
      return title || detail;
    }
    return String(itemLike || '').trim();
  }

  function renderInsights(payload) {
    const locale = payload?.locale || getLanguageTag();
    const t = getTaxonomyTexts(locale);
    lastInsightsPayload = payload;
    try {
      window.__gmLastInsightsPayload = payload;
      window.__gmLastInsightsAt = new Date().toISOString();
    } catch (_) {}
    setTaxonomyStaticTexts(locale);
    updateFilterControlsFromPayload(payload, locale, t);
    renderFilterStatus(payload, t);
    renderActiveFilterChips(payload, t);
    const fallbackNotice = (activeFallbackNotice && String(activeFallbackNotice.loadedDate || '') === String(payload?.date || ''))
      ? activeFallbackNotice
      : null;
    const fallbackText = fallbackNotice
      ? (locale === 'en-US'
        ? `Requested date ${formatDate(fallbackNotice.requestedDate)} has no operational baseline. Loaded ${formatDate(fallbackNotice.loadedDate)} as the latest historical reference.`
        : `Data solicitada ${formatDate(fallbackNotice.requestedDate)} sem base operacional. Carregada ${formatDate(fallbackNotice.loadedDate)} como ultima referencia historica.`)
      : '';
    const isRecordBaseAvailable = payload?.exists === true;
    const noBaseText = locale === 'en-US'
      ? 'No operational baseline is registered for this date.'
      : 'Não há base operacional registrada para esta data.';
    const noBaseActionText = locale === 'en-US'
      ? 'Register the day operation data to enable the executive analysis.'
      : 'Registre os dados operacionais do dia para habilitar a análise executiva.';
    const insights = payload?.insights || {};
    const monthlyOs = payload?.monthlyOs || {};
    const brain = payload?.brain || {};
    const scoreOperational = brain?.scoreOperational || {};
    const executive = brain?.executiveDecision || {};
    const brainAlerts = Array.isArray(brain?.alerts) ? brain.alerts : [];
    const normalizedBrainAlerts = brainAlerts.map(normalizeAlertText).filter(Boolean);
    const normalizedInsightAlerts = (Array.isArray(insights?.alerts) ? insights.alerts : [])
      .map(normalizeAlertText)
      .filter(Boolean);
    const mainActions = [
      executive?.recommendedAction,
      executive?.nextExecutiveAction,
      ...(Array.isArray(insights.actions24h) ? insights.actions24h : [])
    ].filter(Boolean);
    if (!mainActions.length && normalizedInsightAlerts.length) {
      mainActions.push(normalizedInsightAlerts[0]);
    }
    const k = insights.kpis || {};
    const useMonthlyOs = Number(monthlyOs?.sampleDays || 0) > 0;
    const atendimentoMix = useMonthlyOs ? (monthlyOs.atendimentoMix || {}) : (insights.atendimentoMix || {});
    const coberturaMix = useMonthlyOs ? (monthlyOs.coberturaMix || {}) : (insights.coberturaMix || {});
    const operacaoMix = useMonthlyOs ? (monthlyOs.operacaoMix || {}) : (insights.operacaoMix || {});
    const osAudit = useMonthlyOs ? (monthlyOs.osAudit || {}) : (insights.osAudit || {});
    const pricing = { ...(insights.pricing || {}) };
    if (useMonthlyOs && monthlyOs?.pricing?.reconciliation) {
      pricing.reconciliation = monthlyOs.pricing.reconciliation;
    }
    const exec = (k.execucao == null ? '--' : `${k.execucao}%`);

    const baseDate = formatDate(payload?.date || insights.date);
    if (useMonthlyOs && monthlyOs?.month && monthlyOs.month.includes('-')) {
      const [yy, mm] = String(monthlyOs.month).split('-');
      setText('gmDate', `${baseDate} • M${mm}/${yy}`);
    } else {
      setText('gmDate', baseDate);
    }
    setText('gmScore', scoreOperational.value == null ? (insights.score == null ? 0 : insights.score) : scoreOperational.value);
    renderLevel(scoreOperational.level || insights.level || 'Estavel');
    setText('gmSla', k.sla == null ? '--' : `${k.sla}%`);
    setText('gmExec', exec);
    setText('gmTickets', k.ticketsPendentes == null ? 0 : k.ticketsPendentes);
    setText('gmAtrasos', k.pedidosAtraso == null ? 0 : k.pedidosAtraso);
    setText('gmPendAdm', k.pendenciasAdm == null ? 0 : k.pendenciasAdm);
    // Cockpit Operational read: prefer executive monthly distribution when available.
    renderCockpitOperationalRead(payload, locale);
    const histContext = document.getElementById('gmHistTechPeriodContext');
    if (histContext) {
      const labelPrefix = locale === 'en-US' ? 'Period: ' : 'Período: ';
      histContext.textContent = `${labelPrefix}${formatHistoricalPeriodContext(payload, locale)}`;
    }
    const histSelect = document.getElementById('gmHistTechPeriodSelect');
    if (histSelect) {
      const type = String(payload?.historicalIntelligence?.technicians?.period?.type || '').trim().toLowerCase();
      if (type && ['monthly', 'quarterly', 'ytd', 'historical'].includes(type)) histSelect.value = type;
    }
    const topAlertFromBackend = String(executive.topPriority || '').trim()
      || normalizedBrainAlerts[0]
      || normalizeAlertText(insights.topAlert)
      || normalizedInsightAlerts[0]
      || '';
    setText('gmTopAlert', isRecordBaseAvailable
      ? (topAlertFromBackend || (locale === 'en-US' ? 'No critical operational alert for the selected base.' : 'Sem risco operacional crítico na base selecionada.'))
      : noBaseText);
    setText('gmMainAction', isRecordBaseAvailable
      ? (mainActions.length ? mainActions[0] : (locale === 'en-US' ? 'Maintain execution cadence and review new exceptions as they arrive.' : 'Manter cadência de execução e revisar novas exceções conforme entrada.'))
      : noBaseActionText);
    if (isRecordBaseAvailable && fallbackText) {
      setText('gmTopAlert', fallbackText);
      setText('gmMainAction', locale === 'en-US'
        ? 'Review the loaded historical date before operational decisions.'
        : 'Revise a data historica carregada antes da decisao operacional.');
    }
    renderClientList(insights.criticalClients || []);
    renderActionList(mainActions);
    renderOsAudit(osAudit, operacaoMix, pricing);
    updateAutomaticAiStatus(payload);
    if (moduleRequiresTaxonomy(activeModuleKey)) {
      renderTaxonomy(payload);
    } else {
      applyModuleVisibility();
    }
    if (!isRecordBaseAvailable) {
      setText('gmTopAlert', noBaseText);
      setText('gmMainAction', noBaseActionText);
      setText('gmTaxNarrativeSummary', `${noBaseText}. ${noBaseActionText}`);
    } else if (fallbackText) {
      setText('gmTaxNarrativeSummary', fallbackText);
    }
  }

  async function fetchInsights(forceDate, signal) {
    const date = (forceDate || activeDate()).trim();
    if (!date) return null;
    const filters = ensureAppliedInsightsFilters();
    const cacheKey = getInsightsCacheKey(date, filters, getLanguageTag());
    const cached = getInsightsPayloadFromCache(cacheKey);
    if (cached) {
      perfInfo('[PERF][AI-TECH] insights_cache_hit date=' + date);
      return cached;
    }
    if (insightsInFlight.has(cacheKey)) {
      perfInfo('[PERF][AI-TECH] insights_join_inflight date=' + date);
      return insightsInFlight.get(cacheKey);
    }
    const query = buildInsightsFilterQuery(filters);
    const endpoint = query
      ? `/api/insights/${encodeURIComponent(date)}?${query}`
      : `/api/insights/${encodeURIComponent(date)}`;
    const token = getToken();
    const headers = {
      'x-panel-lang': getLanguageTag()
    };
    if (token) headers['x-auth-token'] = token;
    const fetchLabel = '[PERF][AI-TECH] api_insights_' + date;
    const startedAt = performance.now();
    perfInfo('[PERF][AI-TECH] inicio chamada /api/insights date=' + date);
    perfTime(fetchLabel);
    const requestPromise = (async () => {
      try {
        const response = await Promise.race([
          fetch(withAuth(endpoint), {
            cache: 'no-store',
            headers,
            signal
          }),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('timeout_insights')), 45000);
          })
        ]);
        perfTimeEnd(fetchLabel);
        perfInfo('[PERF][AI-TECH] fim chamada /api/insights date=' + date + ' status=' + response.status + ' ms=' + Math.round(performance.now() - startedAt));
        if (response.status === 401) {
          setTechnicalAnalysisLoadingState(getLanguageTag() === 'en-US' ? 'Session expired. Sign in again.' : 'Sessao encerrada. Entre novamente.');
          return null;
        }
        if (!response.ok) return null;
        const payload = await response.json();
        putInsightsPayloadCache(cacheKey, payload);
        return payload;
      } finally {
        insightsInFlight.delete(cacheKey);
      }
    })();
    insightsInFlight.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async function fetchLatestHistoricalDate(signal) {
    const token = getToken();
    const headers = {
      'x-panel-lang': getLanguageTag()
    };
    if (token) headers['x-auth-token'] = token;
    const response = await Promise.race([
      fetch(withAuth('/api/analytics/historical/status'), {
        cache: 'no-store',
        headers,
        signal
      }),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('timeout_historical_status')), 20000);
      })
    ]);
    if (!response.ok) return '';
    const payload = await response.json().catch(() => ({}));
    const maxDate = String(payload?.status?.normalization?.period?.maxDate || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(maxDate) ? maxDate : '';
  }

  let timer = 0;
  async function refreshGodMode(forceDate) {
    const normalizedForcedDate = String(forceDate || '').trim();
    if (filterRefreshInFlight) {
      queuedRefreshDate = normalizedForcedDate || queuedRefreshDate || '';
      return;
    }
    const refreshStartedAt = performance.now();
    perfInfo('[PERF][AI-TECH] inicio carregamento painel');
    perfTime('[PERF][AI-TECH] carregamento_painel_total');
    filterRefreshInFlight = true;
    try {
      let targetDate = String((normalizedForcedDate || activeDate() || '')).trim();
      if (!activeFallbackNotice || String(activeFallbackNotice.loadedDate || '') !== targetDate) {
        activeFallbackNotice = null;
      }
      if (moduleRequiresTaxonomy(activeModuleKey)) {
        setTechnicalAnalysisLoadingState();
      }
      const todayDateKey = getLocalISODate(new Date());
      if (!normalizedForcedDate && !autoFallbackDateAttempted && targetDate === todayDateKey) {
        const fallbackDate = await fetchLatestHistoricalDate().catch(() => '');
        if (fallbackDate && fallbackDate !== targetDate) {
          perfInfo('[PERF][AI-TECH] current_date_fallback from=' + targetDate + ' to=' + fallbackDate);
          autoFallbackDateAttempted = true;
          activeFallbackNotice = {
            requestedDate: targetDate,
            loadedDate: fallbackDate,
            reason: 'current_date_without_operational_baseline'
          };
          targetDate = fallbackDate;
          applyActiveDate(fallbackDate);
        }
      }
      const data = await fetchInsights(normalizedForcedDate || targetDate || undefined);
      if (!data) return;
      if (data.date) applyActiveDate(data.date);
      // Defensive hydration: keep filter drawer populated even if later rendering branches short-circuit.
      try {
        const locale = data?.locale || getLanguageTag();
        const t = getTaxonomyTexts(locale);
        updateFilterControlsFromPayload(data, locale, t);
        renderFilterStatus(data, t);
        renderActiveFilterChips(data, t);
        if (data.exists === false) {
          const noBaseText = locale === 'en-US'
            ? 'No operational baseline is registered for this date.'
            : 'Não há base operacional registrada para esta data.';
          const noBaseActionText = locale === 'en-US'
            ? 'Register the day operation data to enable the executive analysis.'
            : 'Registre os dados operacionais do dia para habilitar a análise executiva.';
          setText('gmTopAlert', noBaseText);
          setText('gmMainAction', noBaseActionText);
          setText('gmTaxNarrativeSummary', `${noBaseText}. ${noBaseActionText}`);
        }
      } catch (_) {}
      if (!normalizedForcedDate && !autoFallbackDateAttempted && data.exists === false) {
        autoFallbackDateAttempted = true;
        const fallbackDate = await fetchLatestHistoricalDate().catch(() => '');
        if (fallbackDate && fallbackDate !== targetDate) {
          applyActiveDate(fallbackDate);
          activeFallbackNotice = {
            requestedDate: targetDate,
            loadedDate: fallbackDate,
            reason: 'no_operational_baseline'
          };
          const fallbackPayload = await fetchInsights(fallbackDate);
          if (fallbackPayload) {
            renderInsights(fallbackPayload);
            return;
          }
        }
      }
      if (data.exists === true) {
        autoFallbackDateAttempted = true;
        if (!activeFallbackNotice || String(activeFallbackNotice.loadedDate || '') !== String(data.date || '')) {
          activeFallbackNotice = null;
        }
      }
      renderInsights(data);
    } catch (err) {
      console.warn('Falha ao atualizar painel inteligente.', err);
      setTechnicalAnalysisLoadingState(getLanguageTag() === 'en-US' ? 'Could not load technical analysis.' : 'Nao foi possivel carregar a analise tecnica.');
    } finally {
      perfInfo('[PERF][AI-TECH] fim carregamento painel ms=' + Math.round(performance.now() - refreshStartedAt));
      perfTimeEnd('[PERF][AI-TECH] carregamento_painel_total');
      filterRefreshInFlight = false;
      if (queuedRefreshDate !== null) {
        const nextDate = queuedRefreshDate;
        queuedRefreshDate = null;
        refreshGodMode(nextDate || undefined).catch(() => {});
      }
    }
  }

  function queueRefresh() {
    if (!getToken() || isAuthLocked()) return;
    const drawer = document.getElementById('gmFilterDrawer');
    if (drawer && drawer.classList.contains('is-open')) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      refreshGodMode().catch(() => {});
    }, 700);
  }

  function shouldSkipAutoRefreshFromEvent(targetLike) {
    const drawer = document.getElementById('gmFilterDrawer');
    if (drawer && drawer.classList.contains('is-open')) return true;
    if (!(targetLike instanceof Element)) return false;
    const targetId = String(targetLike.id || '').trim();
    if (['currentDateInput', 'floatingDateInput', 'op_data', 'ag_data_base'].includes(targetId)) return true;
    if (targetLike.closest('#gmFilterDrawer')) return true;
    if (targetLike.closest('#gmOpenFiltersBtn')) return true;
    if (targetLike.closest('#gmFilterChips')) return true;
    if (targetLike.closest('#gmMobileModuleSelect')) return true;
    if (targetLike.closest('.gm-module-btn')) return true;
    if (targetLike.closest('.gm-view-btn')) return true;
    return false;
  }

  function bindManualReloadCacheInvalidation() {
    if (window.__gmManualReloadCacheBound === true) return;
    window.__gmManualReloadCacheBound = true;
    const originalLoadSelectedDate = window.loadSelectedDate;
    if (typeof originalLoadSelectedDate === 'function') {
      window.loadSelectedDate = function () {
        const selectedDate = document.getElementById('currentDateInput')?.value || activeDate();
        clearInsightsCacheForDate(selectedDate);
        autoFallbackDateAttempted = false;
        activeFallbackNotice = null;
        const result = originalLoadSelectedDate.apply(this, arguments);
        window.setTimeout(() => refreshGodMode(selectedDate).catch(() => {}), 0);
        return result;
      };
    }
    const originalLoadTodayRecord = window.loadTodayRecord;
    if (typeof originalLoadTodayRecord === 'function') {
      window.loadTodayRecord = function () {
        clearInsightsRuntimeCache();
        autoFallbackDateAttempted = false;
        activeFallbackNotice = null;
        const result = originalLoadTodayRecord.apply(this, arguments);
        Promise.resolve(result).finally(() => {
          window.setTimeout(() => refreshGodMode().catch(() => {}), 0);
        });
        return result;
      };
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    activeViewMode = readStoredViewMode();
    appliedInsightsFilters = cloneInsightsFilters(collectInsightsFiltersFromUI());
    bindAnalyticsTabs();
    bindModuleAndViewControls();
    bindAiOsPanel();
    bindReviewActionModal();
    bindReviewQueueActions();
    bindManualReloadCacheInvalidation();
    setActiveModule(DEFAULT_MODULE_KEY, { skipRender: true, skipRefresh: true });
    const runInitialRefresh = function () {
      refreshGodMode().catch(() => {});
    };
    let initialRefreshDone = false;
    let initialRefreshTimer = 0;
    const tryInitialRefresh = function () {
      if (initialRefreshDone) return true;
      if (!getToken() || isAuthLocked()) return false;
      initialRefreshDone = true;
      if (initialRefreshTimer) {
        clearInterval(initialRefreshTimer);
        initialRefreshTimer = 0;
      }
      runInitialRefresh();
      return true;
    };
    const handleAuthReady = function (event) {
      const detail = (event && event.detail && typeof event.detail === 'object') ? event.detail : {};
      if (detail.authenticated !== true) return;
      tryInitialRefresh();
    };
    window.addEventListener('panel-auth-changed', handleAuthReady);
    if (!tryInitialRefresh()) {
      let guard = 0;
      initialRefreshTimer = window.setInterval(() => {
        guard += 1;
        if (tryInitialRefresh() || guard >= 40) {
          if (initialRefreshTimer) {
            clearInterval(initialRefreshTimer);
            initialRefreshTimer = 0;
          }
        }
      }, 500);
    }

    document.addEventListener('input', function (event) {
      if (shouldSkipAutoRefreshFromEvent(event.target)) return;
      queueRefresh();
    }, true);

    document.addEventListener('change', function (event) {
      if (shouldSkipAutoRefreshFromEvent(event.target)) return;
      queueRefresh();
    }, true);

    setInterval(() => {
      if (!getToken()) return;
      if (isAuthLocked()) return;
      const drawer = document.getElementById('gmFilterDrawer');
      if (drawer && drawer.classList.contains('is-open')) return;
      refreshGodMode().catch(() => {});
    }, 12000);
  });

  window.addEventListener('panel-language-changed', function () {
    if (!getToken() || isAuthLocked()) return;
    refreshGodMode().catch(() => {});
  });

  window.addEventListener('panel-auth-changed', function (event) {
    const detail = (event && event.detail && typeof event.detail === 'object') ? event.detail : {};
    clearInsightsRuntimeCache();
    if (detail.authenticated === true) {
      refreshGodMode().catch(() => {});
    }
  });

  window.refreshGodMode = function (dateKey) {
    refreshGodMode(dateKey).catch(() => {});
  };

  window.getModuleVisibilitySnapshot = function () {
    const owners = ['resumo', 'operacao', 'analise', 'tecnicos', 'clientes', 'comparativos', 'laudo', 'governanca'];
    const isVisibleNode = (nodeLike) => {
      if (!(nodeLike instanceof HTMLElement)) return false;
      if (nodeLike.classList.contains('gm-module-hidden')) return false;
      if (nodeLike.hasAttribute('hidden')) return false;
      const style = window.getComputedStyle(nodeLike);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = nodeLike.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const counts = {};
    owners.forEach((owner) => {
      const list = Array.from(document.querySelectorAll(`[data-module-owner="${owner}"]`));
      counts[owner] = list.filter((node) => isVisibleNode(node)).length;
    });
    const roots = {};
    Object.entries(MODULE_ROOT_BY_KEY).forEach(([moduleKey, rootId]) => {
      const root = document.getElementById(rootId);
      roots[moduleKey] = root ? {
        visible: isVisibleNode(root),
        height: Math.round(root.getBoundingClientRect().height)
      } : null;
    });
    return {
      activeModuleKey,
      activeModuleOwner: resolveActiveModuleOwner(),
      counts,
      roots
    };
  };
})();
