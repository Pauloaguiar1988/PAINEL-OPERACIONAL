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
const DATE_WITH_BASE = process.env.SMOKE_DATE_WITH_BASE || '';
const DATE_WITHOUT_BASE = process.env.SMOKE_DATE_WITHOUT_BASE || '';

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
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return !overlay || !overlay.classList.contains('visible');
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => {
    const active = document.querySelector('.gm-module-btn.is-active');
    return !!active;
  });
  await page.waitForTimeout(800);
}

async function applyDate(page, dateValue) {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes(`/api/insights/${dateValue}`) && res.status() === 200,
    { timeout: 20000 }
  ).catch(() => null);
  await page.evaluate((value) => {
    const ids = ['currentDateInput', 'floatingDateInput'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.refreshGodMode === 'function') {
      window.refreshGodMode(value);
    }
  }, dateValue);
  await responsePromise;
  await page.waitForTimeout(900);
}

async function activateModule(page, moduleKey) {
  const key = String(moduleKey || '').trim();
  if (!key) return;
  const rootByModule = {
    painel_dia: 'gmModuleResumo',
    operacao: 'gmModuleOperacao',
    analise_tecnica: 'gmModuleAnalise',
    tecnicos: 'gmModuleTecnicos',
    clientes: 'gmModuleClientes',
    comparativos: 'gmModuleComparativos',
    laudo: 'gmModuleLaudo',
    governanca: 'gmModuleGovernanca'
  };
  const targetRootId = String(rootByModule[key] || '').trim();
  const clicked = await page.evaluate((targetModule) => {
    const btn = document.querySelector(`[data-gm-module="${targetModule}"]`);
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    return true;
  }, key);
  if (!clicked) {
    await page.click(`[data-gm-module="${key}"]`, { timeout: 8000 });
  }
  await page.waitForFunction((rootId) => {
    const root = document.getElementById(rootId);
    if (!(root instanceof HTMLElement)) return false;
    if (root.hasAttribute('hidden')) return false;
    const st = window.getComputedStyle(root);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity || 1) === 0) return false;
    const rect = root.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, targetRootId, { timeout: 20000 });
}

async function resolveDateWithBaseFromApi(request, headers, preferredDate) {
  const preferred = String(preferredDate || '').trim();
  const probeDate = async (date) => {
    const dateKey = String(date || '').trim();
    if (!dateKey) return false;
    const res = await request.get(`/api/insights/${dateKey}`, { headers }).catch(() => null);
    if (!res) return false;
    if (!res.ok()) return false;
    const json = await res.json().catch(() => ({}));
    return json?.ok === true && json?.exists === true;
  };

  if (preferred && await probeDate(preferred)) return preferred;

  const historicalStatusRes = await request.get('/api/analytics/historical/status', { headers }).catch(() => null);
  if (historicalStatusRes && historicalStatusRes.ok()) {
    const statusJson = await historicalStatusRes.json().catch(() => ({}));
    const maxDate = String(statusJson?.status?.normalization?.period?.maxDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(maxDate) && await probeDate(maxDate)) {
      return maxDate;
    }
  }

  const fallback = preferred || '2026-04-24';
  return fallback;
}

async function loginApiWithRetry(request) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await request.post('/api/auth/login', {
        data: { username: SMOKE_USER, password: SMOKE_PASSWORD, remember: true }
      });
      if (response.ok()) return response;
      lastErr = new Error(`login_status_${response.status()}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (lastErr) throw lastErr;
  throw new Error('login_failed_without_error');
}

async function moduleVisibilitySnapshot(page) {
  const payload = await page.evaluate(() => {
    if (typeof window.getModuleVisibilitySnapshot !== 'function') return null;
    return window.getModuleVisibilitySnapshot();
  });
  if (!payload || typeof payload !== 'object') return null;
  const counts = payload.counts && typeof payload.counts === 'object' ? payload.counts : {};
  return {
    activeModuleKey: String(payload.activeModuleKey || ''),
    activeModuleOwner: String(payload.activeModuleOwner || ''),
    counts: {
      resumo: Number(counts.resumo || 0),
      operacao: Number(counts.operacao || 0),
      analise: Number(counts.analise || 0),
      tecnicos: Number(counts.tecnicos || 0),
      clientes: Number(counts.clientes || 0),
      comparativos: Number(counts.comparativos || 0),
      laudo: Number(counts.laudo || 0),
      governanca: Number(counts.governanca || 0)
    }
  };
}

function formatModuleVisibilityLine(label, snapshot) {
  const c = snapshot.counts;
  return `${label}: visibleResumo=${c.resumo}, visibleOperacao=${c.operacao}, visibleAnalise=${c.analise}, visibleTecnicos=${c.tecnicos}, visibleClientes=${c.clientes}, visibleComparativos=${c.comparativos}, visibleLaudo=${c.laudo}, visibleGovernanca=${c.governanca}`;
}

test('smoke e2e: painel carrega, abas criticas e data com/sem base', async ({ page, request }) => {
  test.setTimeout(300000);
  test.skip(!SMOKE_PASSWORD, 'SMOKE_PASSWORD nao informado e PAINEL_BOOTSTRAP_ADMIN_PASSWORD nao encontrado em .env');
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));

  await loginOnUi(page);

  await activateModule(page, 'painel_dia');
  await expect(page.locator('#gmModuleResumo')).toBeVisible();
  await expect(page.locator('[data-gm-module="operacao"]')).toBeVisible();
  await expect(page.locator('[data-gm-module="clientes"]')).toBeVisible();

  await activateModule(page, 'clientes');
  await expect(page.locator('#gmModuleClientes')).toBeVisible();
  await expect(page.locator('#gmHistClientsBox')).toBeVisible();
  await expect(page.locator('#gmHistTechniciansBox')).toBeHidden();
  await expect(page.locator('#gmHistComparativesBox')).toBeHidden();
  await expect(page.locator('#gmHistLaudoBox')).toBeHidden();

  await activateModule(page, 'tecnicos');
  await expect(page.locator('#gmModuleTecnicos')).toBeVisible();
  await expect(page.locator('#gmHistTechniciansBox')).toBeVisible();

  await activateModule(page, 'laudo');
  await expect(page.locator('#gmModuleLaudo')).toBeVisible();
  await expect(page.locator('#gmHistLaudoBox')).toBeVisible();

  await activateModule(page, 'comparativos');
  await expect(page.locator('#gmModuleComparativos')).toBeVisible();
  await expect(page.locator('#gmQuarterlySelect')).toBeVisible();

  await activateModule(page, 'operacao');
  await expect(page.locator('#gmModuleOperacao')).toBeVisible();
  await expect(page.locator('#gmPanelAuditWrap')).toBeVisible();

  await applyDate(page, DATE_WITH_BASE || '2026-04-24');
  await page.click('#gmOpenFiltersBtn');
  await expect(page.locator('#gmFilterDrawer')).toHaveAttribute('aria-hidden', 'false');
  await page.selectOption('#gmFilterPeriod', 'historical');
  await page.evaluate(() => {
    const containers = ['gmFilterClientChecks', 'gmFilterCnpjChecks', 'gmFilterTechnicianChecks', 'gmFilterEquipmentChecks'];
    for (const id of containers) {
      const box = document.getElementById(id);
      if (!box) continue;
      const input = box.querySelector('input[type="checkbox"]');
      if (!input) continue;
      if (!input.checked) {
        input.click();
      }
      break;
    }
  });
  await page.click('#gmApplyFiltersBtn');
  await page.waitForTimeout(1200);
  await expect(page.locator('#gmFilterDrawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#gmFilterActiveCount')).not.toHaveText('0');
  await page.click('#gmOpenFiltersBtn');
  await expect(page.locator('#gmFilterDrawer')).toHaveAttribute('aria-hidden', 'false');
  await page.click('#gmClearFiltersBtn');
  await page.waitForTimeout(800);
  await expect(page.locator('#gmFilterActiveCount')).toHaveText('0');
  await expect(page.locator('#gmFilterDrawer')).toHaveAttribute('aria-hidden', 'true');

  const dateWithBase = DATE_WITH_BASE || '2026-04-24';
  const dateWithoutBase = DATE_WITHOUT_BASE || '2101-01-01';

  await activateModule(page, 'painel_dia');
  await applyDate(page, dateWithBase);
  await expect(page.locator('#gmTopAlert')).toBeVisible();
  await expect(page.locator('#gmTopAlert')).not.toHaveText(/^\s*$/);

  await applyDate(page, dateWithoutBase);
  const tokenForNoBase = await page.evaluate(() => (typeof window.getPanelAuthToken === 'function' ? window.getPanelAuthToken() : ''));
  if (tokenForNoBase) {
    const noBaseRes = await request.get(`/api/insights/${dateWithoutBase}`, {
      headers: { 'x-auth-token': tokenForNoBase }
    });
    expect(noBaseRes.ok()).toBeTruthy();
    const noBaseJson = await noBaseRes.json();
    expect(noBaseJson.exists).toBeFalsy();
  }
  await expect(page.locator('#gmModuleResumo')).toBeVisible();

  expect(pageErrors, `Falhas JS capturadas: ${pageErrors.join(' | ')}`).toEqual([]);
});

test('smoke e2e: separacao real por modulo com contagem visivel', async ({ page }) => {
  test.skip(!SMOKE_PASSWORD, 'SMOKE_PASSWORD nao informado e PAINEL_BOOTSTRAP_ADMIN_PASSWORD nao encontrado em .env');

  await loginOnUi(page);
  await expect(page.locator('#painel')).toBeVisible();

  const scenarios = [
    {
      label: 'Resumo',
      moduleKey: 'painel_dia',
      moduleButton: '[data-gm-module="painel_dia"]',
      expectedOwner: 'resumo',
      mustBeZero: ['clientes', 'tecnicos', 'comparativos', 'laudo', 'governanca']
    },
    {
      label: 'Clientes',
      moduleKey: 'clientes',
      moduleButton: '[data-gm-module="clientes"]',
      expectedOwner: 'clientes',
      mustBeZero: ['tecnicos', 'comparativos', 'laudo', 'governanca']
    },
    {
      label: 'Tecnicos',
      moduleKey: 'tecnicos',
      moduleButton: '[data-gm-module="tecnicos"]',
      expectedOwner: 'tecnicos',
      mustBeZero: ['clientes', 'comparativos', 'laudo', 'governanca']
    }
  ];

  for (const scenario of scenarios) {
    await activateModule(page, scenario.moduleKey);
    await page.waitForTimeout(550);
    const snapshot = await moduleVisibilitySnapshot(page);
    expect(snapshot, `Snapshot ausente para ${scenario.label}`).toBeTruthy();
    expect(snapshot.activeModuleOwner).toBe(scenario.expectedOwner);
    expect(snapshot.counts[scenario.expectedOwner], `${scenario.label} sem blocos visiveis do proprio modulo`).toBeGreaterThan(0);
    for (const owner of scenario.mustBeZero) {
      expect(snapshot.counts[owner], `${scenario.label} nao pode exibir blocos do owner ${owner}`).toBe(0);
    }
    console.log(formatModuleVisibilityLine(scenario.label, snapshot));
  }
});

test('smoke api: reviewQueue, exports e jobs continuam ativos', async ({ request }) => {
  test.setTimeout(300000);
  test.skip(!SMOKE_PASSWORD, 'SMOKE_PASSWORD nao informado e PAINEL_BOOTSTRAP_ADMIN_PASSWORD nao encontrado em .env');

  const loginRes = await loginApiWithRetry(request);
  expect(loginRes.ok()).toBeTruthy();
  const loginJson = await loginRes.json();
  expect(loginJson.ok).toBeTruthy();
  const token = String(loginJson.token || '').trim();
  expect(token.length).toBeGreaterThan(16);
  const headers = { 'x-auth-token': token };
  const withBaseDate = await resolveDateWithBaseFromApi(request, headers, DATE_WITH_BASE || '2026-04-14');
  const withoutBaseDate = DATE_WITHOUT_BASE || '2101-01-01';

  const reviewRes = await request.get(`/api/review-queue/workflow/${withBaseDate}?periodType=daily`, { headers });
  expect(reviewRes.ok()).toBeTruthy();
  const reviewJson = await reviewRes.json();
  expect(reviewJson.ok).toBeTruthy();

  const monthlyRes = await request.get(`/api/reports/executive-monthly/json/${withBaseDate}`, { headers });
  expect(monthlyRes.ok()).toBeTruthy();
  const monthlyJson = await monthlyRes.json();
  expect(String(monthlyJson.schema || '')).toContain('monthly_executive_export_bundle');

  const quarterlyRes = await request.get('/api/reports/executive-quarterly/json/2026-Q2', { headers });
  expect(quarterlyRes.ok()).toBeTruthy();
  const quarterlyJson = await quarterlyRes.json();
  expect(String(quarterlyJson.schema || '')).toContain('quarterly_executive_export_bundle');

  const monthlyJobRes = await request.get('/api/reports/executive-monthly/job/status', { headers });
  expect(monthlyJobRes.ok()).toBeTruthy();
  const monthlyJobJson = await monthlyJobRes.json();
  expect(monthlyJobJson.ok).toBeTruthy();
  expect(monthlyJobJson.config && typeof monthlyJobJson.config.enabled === 'boolean').toBeTruthy();

  const quarterlyJobRes = await request.get('/api/reports/executive-quarterly/job/status', { headers });
  expect(quarterlyJobRes.ok()).toBeTruthy();
  const quarterlyJobJson = await quarterlyJobRes.json();
  expect(quarterlyJobJson.ok).toBeTruthy();
  expect(quarterlyJobJson.config && typeof quarterlyJobJson.config.enabled === 'boolean').toBeTruthy();

  const insightsWithBaseRes = await request.get(`/api/insights/${withBaseDate}`, { headers });
  expect(insightsWithBaseRes.ok()).toBeTruthy();
  const insightsWithBaseJson = await insightsWithBaseRes.json();
  expect(insightsWithBaseJson.exists).toBeTruthy();

  let insightsNoBaseRes = null;
  let insightsNoBaseErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      insightsNoBaseRes = await request.get(`/api/insights/${withoutBaseDate}`, { headers });
      insightsNoBaseErr = null;
      break;
    } catch (err) {
      insightsNoBaseErr = err;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  if (!insightsNoBaseRes && insightsNoBaseErr) throw insightsNoBaseErr;
  expect(insightsNoBaseRes.ok()).toBeTruthy();
  const insightsNoBaseJson = await insightsNoBaseRes.json();
  expect(insightsNoBaseJson.exists).toBeFalsy();
});

test('smoke api: historico analitico importavel e payload aditivo nos insights', async ({ request }) => {
  test.setTimeout(300000);
  test.skip(!SMOKE_PASSWORD, 'SMOKE_PASSWORD nao informado e PAINEL_BOOTSTRAP_ADMIN_PASSWORD nao encontrado em .env');

  const loginRes = await loginApiWithRetry(request);
  expect(loginRes.ok()).toBeTruthy();
  const loginJson = await loginRes.json();
  expect(loginJson.ok).toBeTruthy();
  const token = String(loginJson.token || '').trim();
  expect(token.length).toBeGreaterThan(16);
  const headers = { 'x-auth-token': token };

  const statusRes = await request.get('/api/analytics/historical/status', { headers });
  expect(statusRes.ok()).toBeTruthy();
  const statusJson = await statusRes.json();
  expect(statusJson.ok).toBeTruthy();
  expect(statusJson.status && typeof statusJson.status === 'object').toBeTruthy();

  const workbookPath = process.env.SMOKE_HISTORICAL_XLSX
    || String(statusJson?.status?.source?.workbookPath || '').trim();
  const importRes = await request.post('/api/analytics/historical/import', {
    headers,
    data: workbookPath ? { filePath: workbookPath } : {}
  });
  if (importRes.status() === 200) {
    const importJson = await importRes.json();
    expect(importJson.ok).toBeTruthy();
    expect(importJson.imported).toBeTruthy();
    expect(importJson.status && importJson.status.ok === true).toBeTruthy();
  } else {
    const importErrJson = await importRes.json();
    expect(importRes.status()).toBe(400);
    expect(importErrJson.ok).toBeFalsy();
    expect(String(importErrJson.error || '')).toMatch(/historico|arquivo|xlsx/i);
  }

  const dateRef = await resolveDateWithBaseFromApi(request, headers, DATE_WITH_BASE || '2026-04-14');
  const insightsRes = await request.get(`/api/insights/${dateRef}`, { headers });
  expect(insightsRes.ok()).toBeTruthy();
  const insightsJson = await insightsRes.json();
  expect(insightsJson.ok).toBeTruthy();
  expect(insightsJson.historicalIntelligence && typeof insightsJson.historicalIntelligence === 'object').toBeTruthy();
  expect(insightsJson.historicalIntelligence.clients && typeof insightsJson.historicalIntelligence.clients === 'object').toBeTruthy();
  expect(insightsJson.historicalIntelligence.technicians && typeof insightsJson.historicalIntelligence.technicians === 'object').toBeTruthy();
  expect(insightsJson.historicalIntelligence.laudoStandards && typeof insightsJson.historicalIntelligence.laudoStandards === 'object').toBeTruthy();
  expect(insightsJson.historicalIntelligence.panelModularBlueprint && typeof insightsJson.historicalIntelligence.panelModularBlueprint === 'object').toBeTruthy();

  const detailed = insightsJson?.insights?.detailedAnalytics || {};
  expect(detailed.clientIntelligence && typeof detailed.clientIntelligence === 'object').toBeTruthy();
  expect(detailed.technicianIntelligence && typeof detailed.technicianIntelligence === 'object').toBeTruthy();
  expect(detailed.comparatives && typeof detailed.comparatives === 'object').toBeTruthy();
  expect(detailed.laudoStandards && typeof detailed.laudoStandards === 'object').toBeTruthy();
  expect(detailed.panelModularBlueprint && typeof detailed.panelModularBlueprint === 'object').toBeTruthy();
  expect(detailed.laudoStandards.compliance && typeof detailed.laudoStandards.compliance === 'object').toBeTruthy();
});
