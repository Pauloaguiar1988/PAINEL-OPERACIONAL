const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

function readLocalEnvValue(key) {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return '';
  const lines = String(fs.readFileSync(envPath, 'utf-8') || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    if (k !== key) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return '';
}

const SMOKE_USER = process.env.SMOKE_USER || 'admin_campinas';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || readLocalEnvValue('PAINEL_BOOTSTRAP_ADMIN_PASSWORD') || '';

async function loginOnUi(page) {
  await page.goto('/');
  const loginForm = page.locator('#authLoginForm');
  const hasLoginForm = await loginForm.isVisible().catch(() => false);
  if (hasLoginForm) {
    await page.fill('#authUsername', SMOKE_USER);
    await page.fill('#authPassword', SMOKE_PASSWORD);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/auth/login') && res.status() === 200),
      page.locator('#authLoginForm button[type="submit"]').click()
    ]);
  }
  const overlay = page.locator('#authOverlay');
  if (await overlay.count()) {
    await expect(overlay).not.toHaveClass(/visible/);
  }
  await page.waitForFunction(() => !!document.querySelector('.gm-module-btn.is-active'));
  await page.waitForTimeout(800);
}

test('e2e visual: auditoria real de modularizacao, payload e render', async ({ page, request }) => {
  test.setTimeout(300000);
  test.skip(!SMOKE_PASSWORD, 'SMOKE_PASSWORD nao informado e PAINEL_BOOTSTRAP_ADMIN_PASSWORD nao encontrado em .env');

  const evidenceDir = path.join(__dirname, '..', 'data', 'test-evidence', 'ui-modules');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const consoleErrors = [];
  let latestInsightsPayload = null;
  let insightsResponseCount = 0;

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(String(msg.text() || '').trim());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err?.message || err || '').trim());
  });
  page.on('response', async (res) => {
    try {
      if (!res.url().includes('/api/insights/')) return;
      if (res.status() !== 200) return;
      insightsResponseCount += 1;
      latestInsightsPayload = await res.json();
    } catch (_) {}
  });

  await loginOnUi(page);
  await page.waitForTimeout(1400);
  if (!latestInsightsPayload) {
    await page.evaluate(() => {
      if (typeof window.refreshGodMode === 'function') window.refreshGodMode();
    });
    await page.waitForTimeout(1300);
  }

  const loadedAssets = await page.evaluate(async () => {
    const css = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((node) => String(node.getAttribute('href') || ''));
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((node) => String(node.getAttribute('src') || ''));
    let serviceWorkerRegistrations = 0;
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
        serviceWorkerRegistrations = (await navigator.serviceWorker.getRegistrations()).length;
      }
    } catch (_) {}
    return { css, scripts, serviceWorkerRegistrations };
  });

  expect(loadedAssets.css.some((href) => href.includes('style.css?v=20260427_4'))).toBeTruthy();
  expect(loadedAssets.scripts.some((src) => src.includes('app.js?v=20260427_3'))).toBeTruthy();
  expect(loadedAssets.scripts.some((src) => src.includes('app-godmode.js?v=20260427_3'))).toBeTruthy();
  expect(Number(loadedAssets.serviceWorkerRegistrations || 0)).toBe(0);

  const dateKey = await page.evaluate(() => {
    return String(
      document.getElementById('currentDateInput')?.value
      || document.getElementById('floatingDateInput')?.value
      || ''
    ).trim();
  });
  const token = await page.evaluate(() => (typeof window.getPanelAuthToken === 'function' ? window.getPanelAuthToken() : ''));
  expect(String(token || '').length).toBeGreaterThan(16);
  const headers = { 'x-auth-token': token };
  let dateWithBase = dateKey || '2026-04-24';
  const historicalStatusRes = await request.get('/api/analytics/historical/status', { headers });
  if (historicalStatusRes.ok()) {
    const statusJson = await historicalStatusRes.json().catch(() => ({}));
    const maxDate = String(statusJson?.status?.normalization?.period?.maxDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(maxDate)) dateWithBase = maxDate;
  }

  const refreshResponsePromise = page.waitForResponse(
    (res) => res.url().includes(`/api/insights/${dateWithBase}`) && res.status() === 200,
    { timeout: 45000 }
  ).catch(() => null);
  await page.evaluate((value) => {
    const ids = ['currentDateInput', 'floatingDateInput'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.refreshGodMode === 'function') window.refreshGodMode(value);
  }, dateWithBase);
  await refreshResponsePromise;
  await page.waitForTimeout(900);
  if (!latestInsightsPayload) {
    await page.evaluate(() => { if (typeof window.refreshGodMode === 'function') window.refreshGodMode(); });
    await page.waitForTimeout(1200);
  }

  const apiInsightsRes = await request.get(`/api/insights/${encodeURIComponent(dateWithBase)}?period=historical`, {
    headers: { 'x-auth-token': token }
  });
  expect(apiInsightsRes.ok()).toBeTruthy();
  const apiInsights = await apiInsightsRes.json();

  const modules = [
    { key: 'painel_dia', label: 'resumo', button: '[data-gm-module="painel_dia"]', file: 'resumo.png', rootId: 'gmModuleResumo' },
    { key: 'operacao', label: 'operacao', button: '[data-gm-module="operacao"]', file: 'operacao.png', rootId: 'gmModuleOperacao' },
    { key: 'analise_tecnica', label: 'analise', button: '[data-gm-module="analise_tecnica"]', file: 'analise.png', rootId: 'gmModuleAnalise' },
    { key: 'tecnicos', label: 'tecnicos', button: '[data-gm-module="tecnicos"]', file: 'tecnicos.png', rootId: 'gmModuleTecnicos' },
    { key: 'clientes', label: 'clientes', button: '[data-gm-module="clientes"]', file: 'clientes.png', rootId: 'gmModuleClientes' },
    { key: 'comparativos', label: 'comparativos', button: '[data-gm-module="comparativos"]', file: 'comparativos.png', rootId: 'gmModuleComparativos' },
    { key: 'laudo', label: 'laudo', button: '[data-gm-module="laudo"]', file: 'laudo.png', rootId: 'gmModuleLaudo' },
    { key: 'governanca', label: 'governanca', button: '[data-gm-module="governanca"]', file: 'governanca.png', rootId: 'gmModuleGovernanca' }
  ];

  const moduleDomAudit = {};
  for (const moduleCfg of modules) {
    await page.click(moduleCfg.button);
    await page.waitForTimeout(550);
    const domState = await page.evaluate((cfg) => {
      const isVisible = (nodeLike) => {
        if (!(nodeLike instanceof HTMLElement)) return false;
        if (nodeLike.hasAttribute('hidden')) return false;
        const st = window.getComputedStyle(nodeLike);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity || 1) === 0) return false;
        const rect = nodeLike.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const activeRoot = document.getElementById(cfg.rootId);
      const visibleRoots = Array.from(document.querySelectorAll('[data-gm-module-root]'))
        .filter((node) => isVisible(node))
        .map((node) => ({ id: node.id, key: node.getAttribute('data-gm-module-root') }));
      const leakedVisibleBlocks = Array.from(document.querySelectorAll('#painel .system-upgrade-wrap,#painel .system-radar,#painel .system-white-card,#painel .gm-tax-box,#painel .gm-tax-priority,#painel .gm-tax-summary-grid,#painel .gm-tax-panel'))
        .filter((node) => isVisible(node))
        .filter((node) => !node.closest(`#${cfg.rootId}`))
        .filter((node) => !node.closest('#gmFilterDrawer'))
        .filter((node) => !node.closest('#gmPanelToolbar'))
        .map((node) => ({
          id: node.id || null,
          cls: node.className || '',
          height: Math.round(node.getBoundingClientRect().height)
        }))
        .slice(0, 40);
      const wrappersOutside = Array.from(document.querySelectorAll('[data-module-shell],[data-module-row],.gm-taxonomy-card,.gm-tax-row,.gm-tax-panel'))
        .filter((node) => isVisible(node))
        .filter((node) => !node.closest(`#${cfg.rootId}`))
        .map((node) => ({
          id: node.id || null,
          cls: node.className || '',
          height: Math.round(node.getBoundingClientRect().height),
          display: window.getComputedStyle(node).display
        }))
        .slice(0, 40);
      const owners = ['resumo', 'operacao', 'analise', 'tecnicos', 'clientes', 'comparativos', 'laudo', 'governanca'];
      const ownerVisibleCount = {};
      owners.forEach((owner) => {
        ownerVisibleCount[owner] = Array.from(document.querySelectorAll(`[data-module-owner="${owner}"]`)).filter((node) => isVisible(node)).length;
      });
      const visibleTexts = Array.from((activeRoot || document).querySelectorAll('h2,h3,h4,.system-kicker,.system-line strong,.gm-tax-line strong'))
        .filter((node) => isVisible(node))
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 50);
      const criticalIds = ['gmHistClientsBox', 'gmHistTechniciansBox', 'gmHistComparativesBox', 'gmHistLaudoBox', 'gmTaxReviewPriorityBox', 'gmTaxReviewSummaryBox', 'gmTaxReviewQueueBox'];
      const critical = {};
      criticalIds.forEach((id) => {
        const node = document.getElementById(id);
        critical[id] = { exists: !!node, visible: isVisible(node) };
      });
      return {
        activeSidebarModule: document.querySelector('.gm-module-btn.is-active')?.getAttribute('data-gm-module') || '',
        activeRootVisible: isVisible(activeRoot),
        activeRootHeight: activeRoot ? Math.round(activeRoot.getBoundingClientRect().height) : 0,
        visibleRoots,
        leakedVisibleBlocks,
        wrappersOutside,
        ownerVisibleCount,
        visibleTexts,
        critical
      };
    }, moduleCfg);
    moduleDomAudit[moduleCfg.key] = domState;
    expect(domState.activeSidebarModule).toBe(moduleCfg.key);
    expect(domState.activeRootVisible).toBeTruthy();
    expect(domState.visibleRoots.length).toBe(1);
    expect(domState.visibleRoots[0].key).toBe(moduleCfg.key);
    expect(domState.leakedVisibleBlocks.length).toBe(0);
    expect(domState.wrappersOutside.length).toBe(0);
    await page.screenshot({ path: path.join(evidenceDir, moduleCfg.file), fullPage: true });
  }

  await page.click('#gmOpenFiltersBtn');
  await expect(page.locator('#gmFilterDrawer')).toHaveAttribute('aria-hidden', 'false');
  await page.screenshot({ path: path.join(evidenceDir, 'filtros.png'), fullPage: true });
  await page.click('#gmCloseFiltersBtn');

  const moduleDataAudit = {
    clientes: {
      backendHasData: !!apiInsights?.historicalIntelligence?.clients,
      frontendReceived: insightsResponseCount > 0,
      renderExecuted: moduleDomAudit.clientes.ownerVisibleCount.clientes > 0,
      elementExists: moduleDomAudit.clientes.critical.gmHistClientsBox.exists,
      visible: moduleDomAudit.clientes.critical.gmHistClientsBox.visible
    },
    tecnicos: {
      backendHasData: !!apiInsights?.historicalIntelligence?.technicians,
      frontendReceived: insightsResponseCount > 0,
      renderExecuted: moduleDomAudit.tecnicos.ownerVisibleCount.tecnicos > 0,
      elementExists: moduleDomAudit.tecnicos.critical.gmHistTechniciansBox.exists,
      visible: moduleDomAudit.tecnicos.critical.gmHistTechniciansBox.visible
    },
    comparativos: {
      backendHasData: !!apiInsights?.historicalIntelligence?.comparatives,
      frontendReceived: insightsResponseCount > 0,
      renderExecuted: moduleDomAudit.comparativos.ownerVisibleCount.comparativos > 0,
      elementExists: !!moduleDomAudit.comparativos,
      visible: moduleDomAudit.comparativos.activeRootVisible
    },
    laudo: {
      backendHasData: !!apiInsights?.historicalIntelligence?.laudoStandards,
      frontendReceived: insightsResponseCount > 0,
      renderExecuted: moduleDomAudit.laudo.ownerVisibleCount.laudo > 0,
      elementExists: moduleDomAudit.laudo.critical.gmHistLaudoBox.exists,
      visible: moduleDomAudit.laudo.critical.gmHistLaudoBox.visible
    },
    governanca: {
      backendHasData: !!apiInsights?.insightsDetailed?.reviewWorkflowSummary || !!apiInsights?.insightsDetailed?.reviewQueueSummary,
      frontendReceived: insightsResponseCount > 0,
      renderExecuted: moduleDomAudit.governanca.ownerVisibleCount.governanca > 0,
      elementExists: moduleDomAudit.governanca.critical.gmTaxReviewPriorityBox.exists && moduleDomAudit.governanca.critical.gmTaxReviewSummaryBox.exists,
      visible: moduleDomAudit.governanca.critical.gmTaxReviewPriorityBox.visible || moduleDomAudit.governanca.critical.gmTaxReviewSummaryBox.visible
    }
  };

  const finalReport = {
    generatedAt: new Date().toISOString(),
    loadedAssets,
    insightsDate: apiInsights?.date || dateWithBase,
    insightsExists: !!apiInsights?.exists,
    insightsResponseCount,
    latestInsightsDateSeen: latestInsightsPayload?.date || '',
    filtersDaily: apiInsights?.filters?.daily || null,
    moduleDataAudit,
    moduleDomAudit,
    consoleErrors
  };
  fs.writeFileSync(path.join(evidenceDir, 'audit-ui-modules.json'), JSON.stringify(finalReport, null, 2), 'utf8');
});
