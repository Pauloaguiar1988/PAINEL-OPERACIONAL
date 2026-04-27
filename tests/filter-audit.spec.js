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
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return !overlay || !overlay.classList.contains('visible');
  }, { timeout: 15000 }).catch(() => {});
}

test('e2e visual: auditoria detalhada dos filtros checklist', async ({ page, request }) => {
  test.setTimeout(180000);
  test.skip(!SMOKE_PASSWORD, 'SMOKE_PASSWORD nao informado e PAINEL_BOOTSTRAP_ADMIN_PASSWORD nao encontrado em .env');

  const evidenceDir = path.join(__dirname, '..', 'data', 'test-evidence', 'ui-modules');
  fs.mkdirSync(evidenceDir, { recursive: true });

  await loginOnUi(page);

  const token = await page.evaluate(() => (typeof window.getPanelAuthToken === 'function' ? window.getPanelAuthToken() : ''));
  expect(String(token || '').length).toBeGreaterThan(16);

  let maxDate = '2026-04-24';
  const statusRes = await request.get('/api/analytics/historical/status', { headers: { 'x-auth-token': token } });
  if (statusRes.ok()) {
    const statusJson = await statusRes.json().catch(() => ({}));
    const candidate = String(statusJson?.status?.normalization?.period?.maxDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) maxDate = candidate;
  }

  await page.evaluate((dateValue) => {
    ['currentDateInput', 'floatingDateInput'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = dateValue;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.refreshGodMode === 'function') window.refreshGodMode(dateValue);
  }, maxDate);
  await page.waitForFunction(() => {
    const available = window.__gmLastFilterAvailable;
    return !!available && Array.isArray(available.clients) && available.clients.length > 0;
  }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(900);

  await page.click('#gmOpenFiltersBtn');
  await expect(page.locator('#gmFilterDrawer')).toHaveAttribute('aria-hidden', 'false');
  await page.waitForFunction(() => {
    const box = document.getElementById('gmFilterClientChecks');
    if (!(box instanceof HTMLElement)) return false;
    return box.querySelectorAll('label.gm-check-item').length > 0;
  }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);

  const axisAudit = await page.evaluate(() => {
    const isVisible = (nodeLike) => {
      if (!(nodeLike instanceof HTMLElement)) return false;
      if (nodeLike.hasAttribute('hidden')) return false;
      const st = window.getComputedStyle(nodeLike);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity || 1) === 0) return false;
      const rect = nodeLike.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const defs = [
      { key: 'clients', containerId: 'gmFilterClientChecks', searchId: 'gmFilterClientSearch', countId: 'gmFilterClientCount' },
      { key: 'cnpj', containerId: 'gmFilterCnpjChecks', searchId: 'gmFilterCnpjSearch', countId: 'gmFilterCnpjCount' },
      { key: 'technicians', containerId: 'gmFilterTechnicianChecks', searchId: 'gmFilterTechnicianSearch', countId: 'gmFilterTechnicianCount' },
      { key: 'equipment', containerId: 'gmFilterEquipmentChecks', searchId: 'gmFilterEquipmentSearch', countId: 'gmFilterEquipmentCount' },
      { key: 'serviceTypes', containerId: 'gmFilterServiceChecks', searchId: 'gmFilterServiceSearch', countId: 'gmFilterServiceCount' },
      { key: 'warranty', containerId: 'gmFilterWarrantyChecks', searchId: 'gmFilterWarrantySearch', countId: 'gmFilterWarrantyCount' },
      { key: 'retorno', containerId: 'gmFilterRetornoChecks', searchId: 'gmFilterRetornoSearch', countId: 'gmFilterRetornoCount' },
      { key: 'criticity', containerId: 'gmFilterCriticityChecks', searchId: 'gmFilterCriticitySearch', countId: 'gmFilterCriticityCount' }
    ];
    return defs.map((def) => {
      const container = document.getElementById(def.containerId);
      const options = container ? Array.from(container.querySelectorAll('label.gm-check-item')) : [];
      const firstOption = options[0] || null;
      const firstInput = firstOption ? firstOption.querySelector('input[type="checkbox"]') : null;
      const firstText = firstOption ? firstOption.querySelector('span') : null;
      let checkboxLeftOfText = false;
      let checkboxVerticallyAligned = false;
      if (firstInput && firstText) {
        const ir = firstInput.getBoundingClientRect();
        const tr = firstText.getBoundingClientRect();
        checkboxLeftOfText = ir.left <= tr.left;
        const inputCenter = ir.top + (ir.height / 2);
        const textFirstLineCenter = tr.top + Math.min(tr.height, 20) / 2;
        const topAligned = Math.abs(ir.top - tr.top) <= 8;
        const centerAligned = Math.abs(inputCenter - textFirstLineCenter) <= 10;
        checkboxVerticallyAligned = topAligned || centerAligned;
      }
      const style = container ? window.getComputedStyle(container) : null;
      const selectAllBtn = document.querySelector(`.gm-filter-group-action[data-filter-axis="${def.key}"][data-filter-action="all"]`);
      const clearBtn = document.querySelector(`.gm-filter-group-action[data-filter-axis="${def.key}"][data-filter-action="clear"]`);
      const searchInput = document.getElementById(def.searchId);
      const counter = document.getElementById(def.countId);
      return {
        key: def.key,
        hasSearch: !!searchInput,
        hasSelectAll: !!selectAllBtn,
        hasClear: !!clearBtn,
        hasCounter: !!counter,
        optionCount: options.length,
        firstLabel: firstText ? String(firstText.textContent || '').trim() : '',
        checkboxLeftOfText,
        checkboxVerticallyAligned,
        listOverflowY: style ? style.overflowY : '',
        listHeightPx: container ? Math.round(container.getBoundingClientRect().height) : 0,
        containerVisible: isVisible(container)
      };
    });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    dateValue: maxDate,
    filterDrawerOpen: true,
    axisAudit
  };

  fs.writeFileSync(path.join(evidenceDir, 'filter-audit.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));

  expect(axisAudit.every((item) => item.hasSearch && item.hasSelectAll && item.hasClear && item.hasCounter)).toBeTruthy();
  expect(axisAudit.every((item) => item.containerVisible)).toBeTruthy();
  expect(axisAudit.filter((item) => item.optionCount > 0).length).toBeGreaterThan(0);
  expect(axisAudit.filter((item) => item.optionCount > 0).every((item) => item.checkboxLeftOfText && item.checkboxVerticallyAligned)).toBeTruthy();
});
