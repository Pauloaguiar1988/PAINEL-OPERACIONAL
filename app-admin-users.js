(function () {
  const ROLE_LABELS = {
    admin: 'Administrador',
    lider_tecnico: 'Lider Tecnico',
    lider_administrativo: 'Lider Administrativo'
  };

  const SECTION_OPTIONS = [
    { id: 'painel', label: 'Painel do Dia' },
    { id: 'operacao', label: 'Operacao' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'tecnico', label: 'Lider Tecnico' },
    { id: 'administrativo', label: 'Administrativo' },
    { id: 'diagnostico', label: 'Diagnostico Consolidado' },
    { id: 'resultado', label: 'Resultado do Dia' },
    { id: 'executivo', label: 'Executivo' },
    { id: 'negocio', label: 'Negocio' },
    { id: 'melhorias', label: 'Melhorias' },
    { id: 'historico', label: 'Registros por Data' }
  ];

  const ROLE_DEFAULT_PERMISSIONS = {
    admin: SECTION_OPTIONS.map(item => item.id),
    lider_tecnico: ['painel', 'agenda', 'tecnico'],
    lider_administrativo: ['painel', 'agenda', 'administrativo']
  };

  let usersModalReady = false;
  let usersLoading = false;
  let settingsModalReady = false;
  let orgConfigCache = null;

  function getToken() {
    try {
      if (typeof window.getPanelAuthToken === 'function') return window.getPanelAuthToken() || '';
      return localStorage.getItem('ccoi_auth_token_v2') || sessionStorage.getItem('ccoi_auth_token_v2') || '';
    } catch (_) {
      return '';
    }
  }

  function getCurrentUser() {
    try {
      if (typeof window.getPanelCurrentUser === 'function') {
        const user = window.getPanelCurrentUser();
        if (user) return user;
      }
      const local = localStorage.getItem('ccoi_auth_user_v2');
      const session = sessionStorage.getItem('ccoi_auth_user_v2');
      const raw = local || session || '';
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function isAdmin() {
    return String(getCurrentUser()?.role || '').toLowerCase() === 'admin';
  }

  function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) headers['x-auth-token'] = token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha na comunicacao.');
      return data;
    });
  }

  function sanitizePermissions(raw, role) {
    const base = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.lider_tecnico;
    const incoming = Array.isArray(raw) ? raw : [];
    const allowed = new Set(SECTION_OPTIONS.map(item => item.id));
    const clean = [];
    incoming.forEach(entry => {
      const key = String(entry || '').trim().toLowerCase();
      if (!allowed.has(key)) return;
      if (!clean.includes(key)) clean.push(key);
    });
    return clean.length ? clean : base.slice();
  }

  function getRoleLabel(role) {
    return ROLE_LABELS[role] || role || '';
  }

  function setUsersStatus(message, isError) {
    const el = document.getElementById('adminUsersStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function setSettingsStatus(message, isError) {
    const el = document.getElementById('panelSettingsStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function setSmtpStatus(message, isError) {
    const el = document.getElementById('panelSmtpStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function setOrgStatus(message, isError) {
    const el = document.getElementById('panelOrgStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function applyOrgScopeToUserForm(forceFill) {
    const tenantInput = document.getElementById('adminUserTenantKey');
    const unitInput = document.getElementById('adminUserUnitKey');
    if (!tenantInput || !unitInput) return;
    const force = !!forceFill;
    if ((force || !String(tenantInput.value || '').trim()) && orgConfigCache?.tenantKey) {
      tenantInput.value = orgConfigCache.tenantKey;
    }
    if ((force || !String(unitInput.value || '').trim()) && orgConfigCache?.unitKey) {
      unitInput.value = orgConfigCache.unitKey;
    }
  }

  function collectOrgPayload() {
    return {
      companyName: String(document.getElementById('panelOrgCompanyName')?.value || '').trim(),
      tenantKey: String(document.getElementById('panelOrgTenantKey')?.value || '').trim(),
      unitName: String(document.getElementById('panelOrgUnitName')?.value || '').trim(),
      unitKey: String(document.getElementById('panelOrgUnitKey')?.value || '').trim(),
      timezone: String(document.getElementById('panelOrgTimezone')?.value || '').trim(),
      localeDefault: String(document.getElementById('panelOrgLocaleDefault')?.value || 'pt-BR').trim()
    };
  }

  function applyOrgPayload(payload) {
    const config = (payload && typeof payload === 'object') ? payload : {};
    const companyName = String(config.companyName || '').trim();
    const tenantKey = String(config.tenantKey || '').trim();
    const unitName = String(config.unitName || '').trim();
    const unitKey = String(config.unitKey || '').trim();
    const timezone = String(config.timezone || 'America/Sao_Paulo').trim();
    const localeDefault = String(config.localeDefault || 'pt-BR').trim();

    orgConfigCache = {
      companyName,
      tenantKey,
      unitName,
      unitKey,
      timezone,
      localeDefault
    };

    const companyInput = document.getElementById('panelOrgCompanyName');
    const tenantInput = document.getElementById('panelOrgTenantKey');
    const unitNameInput = document.getElementById('panelOrgUnitName');
    const unitKeyInput = document.getElementById('panelOrgUnitKey');
    const tzInput = document.getElementById('panelOrgTimezone');
    const localeInput = document.getElementById('panelOrgLocaleDefault');

    if (companyInput) companyInput.value = companyName;
    if (tenantInput) tenantInput.value = tenantKey;
    if (unitNameInput) unitNameInput.value = unitName;
    if (unitKeyInput) unitKeyInput.value = unitKey;
    if (tzInput) tzInput.value = timezone;
    if (localeInput) localeInput.value = localeDefault;

    applyOrgScopeToUserForm(false);
  }

  async function loadOrgConfig() {
    if (!isAdmin()) return;
    try {
      const payload = await api('/api/admin/org-config', { method: 'GET' });
      applyOrgPayload(payload?.config || {});
      setOrgStatus('', false);
    } catch (err) {
      setOrgStatus(err.message || 'Falha ao carregar empresa/unidade.', true);
    }
  }

  async function handleSaveOrgConfig() {
    if (!isAdmin()) return;
    const btn = document.getElementById('panelOrgSaveBtn');
    if (btn) btn.disabled = true;
    setOrgStatus('Salvando empresa/unidade...', false);
    try {
      const payload = collectOrgPayload();
      const saved = await api('/api/admin/org-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      applyOrgPayload(saved?.config || payload);
      setOrgStatus('Empresa/unidade salva com sucesso.', false);
    } catch (err) {
      setOrgStatus(err.message || 'Falha ao salvar empresa/unidade.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function getSmtpPortValue() {
    const raw = Number(document.getElementById('panelSmtpPort')?.value || 587);
    if (!Number.isFinite(raw)) return 587;
    return Math.max(1, Math.min(65535, Math.round(raw)));
  }

  function collectSmtpPayload() {
    return {
      enabled: !!document.getElementById('panelSmtpEnabled')?.checked,
      host: String(document.getElementById('panelSmtpHost')?.value || '').trim(),
      port: getSmtpPortValue(),
      secure: !!document.getElementById('panelSmtpSecure')?.checked,
      user: String(document.getElementById('panelSmtpUser')?.value || '').trim(),
      pass: String(document.getElementById('panelSmtpPass')?.value || ''),
      from: String(document.getElementById('panelSmtpFrom')?.value || '').trim()
    };
  }

  function applyGmailPreset() {
    const hostEl = document.getElementById('panelSmtpHost');
    const portEl = document.getElementById('panelSmtpPort');
    const secureEl = document.getElementById('panelSmtpSecure');
    if (hostEl) hostEl.value = 'smtp.gmail.com';
    if (portEl) portEl.value = 587;
    if (secureEl) secureEl.checked = false;
    setSmtpStatus('Preset Gmail aplicado. Use senha de app do Google para autenticar.', false);
  }

  function applySmtpPayload(payload, activeSource) {
    const config = (payload && typeof payload === 'object') ? payload : {};
    const source = String(activeSource || 'none');
    const enabledEl = document.getElementById('panelSmtpEnabled');
    const hostEl = document.getElementById('panelSmtpHost');
    const portEl = document.getElementById('panelSmtpPort');
    const secureEl = document.getElementById('panelSmtpSecure');
    const userEl = document.getElementById('panelSmtpUser');
    const passEl = document.getElementById('panelSmtpPass');
    const fromEl = document.getElementById('panelSmtpFrom');
    const hasPassword = !!config.hasPassword;

    if (enabledEl) enabledEl.checked = config.enabled === true;
    if (hostEl) hostEl.value = config.host || '';
    if (portEl) portEl.value = Number(config.port || 587);
    if (secureEl) secureEl.checked = config.secure === true;
    if (userEl) userEl.value = config.user || '';
    if (fromEl) fromEl.value = config.from || '';
    if (passEl) passEl.value = '';

    const sourceLabel = source === 'env'
      ? 'SMTP ativo por variavel de ambiente.'
      : (source === 'file'
        ? `SMTP ativo por configuracao local.${hasPassword ? '' : ' Falta senha.'}`
        : 'SMTP nao configurado.');
    setSmtpStatus(sourceLabel, source === 'none');
  }

  async function loadSmtpConfig() {
    if (!isAdmin()) return;
    try {
      const payload = await api('/api/admin/smtp-config', { method: 'GET' });
      applySmtpPayload(payload?.config, payload?.activeSource);
    } catch (err) {
      setSmtpStatus(err.message || 'Falha ao carregar SMTP.', true);
    }
  }

  function renderPermissionsSelection(selected, role) {
    const root = document.getElementById('adminUserPermissions');
    if (!root) return;
    const values = sanitizePermissions(selected, role);
    root.querySelectorAll('input[type="checkbox"][data-perm]').forEach(input => {
      input.checked = values.includes(input.getAttribute('data-perm'));
    });
  }

  function collectPermissions() {
    const root = document.getElementById('adminUserPermissions');
    if (!root) return [];
    const values = [];
    root.querySelectorAll('input[type="checkbox"][data-perm]:checked').forEach(input => {
      const value = String(input.getAttribute('data-perm') || '').trim().toLowerCase();
      if (!value || values.includes(value)) return;
      values.push(value);
    });
    return values;
  }

  function buildPermissionsChecklist() {
    const root = document.getElementById('adminUserPermissions');
    if (!root) return;
    root.innerHTML = SECTION_OPTIONS.map(item => (
      '<label class="admin-users-perm-item">' +
      `<input type="checkbox" data-perm="${item.id}" />` +
      `<span>${item.label}</span>` +
      '</label>'
    )).join('');
  }

  function renderUsersTable(users) {
    const body = document.getElementById('adminUsersTableBody');
    if (!body) return;
    const list = Array.isArray(users) ? users : [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6">Nenhum usuario cadastrado.</td></tr>';
      return;
    }
    body.innerHTML = list.map(user => {
      const role = getRoleLabel(user.role);
      const active = user.active ? 'Ativo' : 'Inativo';
      const perms = sanitizePermissions(user.menuPermissions, user.role).join(', ');
      const scope = `${user.tenantKey || '--'} / ${user.unitKey || '--'}`;
      return (
        '<tr>' +
        `<td>${user.username || ''}</td>` +
        `<td>${user.displayName || ''}</td>` +
        `<td>${role}</td>` +
        `<td>${active}</td>` +
        `<td>${scope}</td>` +
        `<td>${perms}</td>` +
        '</tr>'
      );
    }).join('');
  }

  async function refreshUsersList() {
    if (usersLoading) return;
    usersLoading = true;
    try {
      const payload = await api('/api/users', { method: 'GET' });
      renderUsersTable(payload.users || []);
      setUsersStatus('', false);
    } catch (err) {
      setUsersStatus(err.message || 'Falha ao carregar usuarios.', true);
    } finally {
      usersLoading = false;
    }
  }

  function applyRoleTemplate() {
    const role = String(document.getElementById('adminUserRole')?.value || 'lider_tecnico').trim();
    renderPermissionsSelection(ROLE_DEFAULT_PERMISSIONS[role], role);
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    const username = String(document.getElementById('adminUserUsername')?.value || '').trim().toLowerCase();
    const displayName = String(document.getElementById('adminUserDisplayName')?.value || '').trim();
    const email = String(document.getElementById('adminUserEmail')?.value || '').trim();
    const password = String(document.getElementById('adminUserPassword')?.value || '');
    const role = String(document.getElementById('adminUserRole')?.value || 'lider_tecnico').trim();
    const active = !!document.getElementById('adminUserActive')?.checked;
    const mustChangePassword = !!document.getElementById('adminUserForceChange')?.checked;
    const tenantKey = String(document.getElementById('adminUserTenantKey')?.value || '').trim();
    const unitKey = String(document.getElementById('adminUserUnitKey')?.value || '').trim();
    const menuPermissions = sanitizePermissions(collectPermissions(), role);

    if (!username || !displayName || !password) {
      setUsersStatus('Preencha usuario, nome e senha provisoria.', true);
      return;
    }

    const submit = document.getElementById('adminUsersSubmit');
    if (submit) submit.disabled = true;
    try {
      await api('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          email,
          password,
          role,
          tenantKey,
          unitKey,
          active,
          mustChangePassword,
          menuPermissions
        })
      });
      setUsersStatus(`Usuario ${username} salvo com sucesso.`, false);
      const form = document.getElementById('adminUsersForm');
      if (form) form.reset();
      const roleInput = document.getElementById('adminUserRole');
      if (roleInput) roleInput.value = 'lider_administrativo';
      const activeInput = document.getElementById('adminUserActive');
      if (activeInput) activeInput.checked = true;
      const forceInput = document.getElementById('adminUserForceChange');
      if (forceInput) forceInput.checked = true;
      applyOrgScopeToUserForm(true);
      applyRoleTemplate();
      refreshUsersList().catch(() => {});
    } catch (err) {
      setUsersStatus(err.message || 'Falha ao salvar usuario.', true);
    } finally {
      if (submit) submit.disabled = false;
      const pwd = document.getElementById('adminUserPassword');
      if (pwd) pwd.value = '';
    }
  }

  function closeUsersModal() {
    const modal = document.getElementById('adminUsersModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openUsersModal() {
    if (!isAdmin()) return;
    ensureUsersModal();
    const modal = document.getElementById('adminUsersModal');
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    applyOrgScopeToUserForm(false);
    refreshUsersList().catch(() => {});
  }

  function getActiveSectionId() {
    return document.querySelector('.section.active')?.id || 'painel';
  }

  function refreshSettingsSummary() {
    const primary = document.getElementById('settingsAutoSavePrimary');
    const secondary = document.getElementById('settingsAutoSaveSecondary');
    if (!primary || !secondary) return;
    const sectionId = getActiveSectionId();
    const footerLabel = document.getElementById(`footerStatusLabel_${sectionId}`)?.textContent || '';
    const footerTime = document.getElementById(`footerStatusTime_${sectionId}`)?.textContent || '';
    const v5Live = document.getElementById(`v5Live_${sectionId}`)?.textContent || '';
    primary.textContent = footerLabel || v5Live || 'Auto save ativo';
    secondary.textContent = footerTime || 'As alteracoes sao salvas automaticamente.';
  }

  function closeSettingsModal() {
    const modal = document.getElementById('panelSettingsModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openSettingsModal() {
    ensureSettingsModal();
    const modal = document.getElementById('panelSettingsModal');
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    const smtpCard = document.getElementById('panelSmtpCard');
    const orgCard = document.getElementById('panelOrgCard');
    const usersBtn = document.getElementById('settingsUsersBtn');
    if (usersBtn) usersBtn.style.display = isAdmin() ? '' : 'none';
    if (smtpCard) smtpCard.style.display = isAdmin() ? '' : 'none';
    if (orgCard) orgCard.style.display = isAdmin() ? '' : 'none';
    const smtpTestTo = document.getElementById('panelSmtpTestTo');
    if (smtpTestTo && !String(smtpTestTo.value || '').trim()) {
      smtpTestTo.value = String(getCurrentUser()?.email || '').trim();
    }
    refreshSettingsSummary();
    setSettingsStatus('', false);
    if (isAdmin()) {
      loadOrgConfig().catch(() => {});
      loadSmtpConfig().catch(() => {});
    }
  }

  async function handleManualSaveNow() {
    const btn = document.getElementById('settingsManualSaveBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('is-loading');
    setSettingsStatus('Executando salvamento manual...', false);
    try {
      if (typeof window.saveCurrentDay === 'function') {
        const result = window.saveCurrentDay(false);
        if (result && typeof result.then === 'function') await result;
      }
      setSettingsStatus('Salvamento manual concluido.', false);
      refreshSettingsSummary();
    } catch (err) {
      setSettingsStatus(err?.message || 'Falha no salvamento manual.', true);
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  async function handleSaveSmtpConfig() {
    if (!isAdmin()) return;
    const btn = document.getElementById('panelSmtpSaveBtn');
    if (btn) btn.disabled = true;
    setSmtpStatus('Salvando configuracao SMTP...', false);
    try {
      const payload = collectSmtpPayload();
      const saved = await api('/api/admin/smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      applySmtpPayload(saved?.config, saved?.activeSource);
      setSmtpStatus('Configuracao SMTP salva com sucesso.', false);
    } catch (err) {
      setSmtpStatus(err.message || 'Falha ao salvar SMTP.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleTestSmtpConfig() {
    if (!isAdmin()) return;
    const btn = document.getElementById('panelSmtpTestBtn');
    if (btn) btn.disabled = true;
    const toEmail = String(document.getElementById('panelSmtpTestTo')?.value || getCurrentUser()?.email || '').trim();
    if (!toEmail) {
      setSmtpStatus('Informe e-mail de destino para teste SMTP.', true);
      if (btn) btn.disabled = false;
      return;
    }
    setSmtpStatus('Enviando e-mail de teste...', false);
    try {
      const resp = await api('/api/admin/smtp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail })
      });
      setSmtpStatus(`Teste SMTP enviado para ${resp?.toEmail || toEmail}.`, false);
    } catch (err) {
      setSmtpStatus(err.message || 'Falha no teste SMTP.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function ensureUsersModal() {
    if (usersModalReady) return;
    let modal = document.getElementById('adminUsersModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adminUsersModal';
      modal.className = 'admin-users-modal';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML =
        '<div class="admin-users-backdrop" data-close-users-modal="1"></div>' +
        '<div class="admin-users-panel">' +
        '<div class="admin-users-head">' +
        '<h3>Gestao de Usuarios</h3>' +
        '<button type="button" class="admin-users-close" data-close-users-modal="1">Fechar</button>' +
        '</div>' +
        '<form id="adminUsersForm" class="admin-users-form" autocomplete="off">' +
        '<div class="admin-users-grid">' +
        '<label>Usuario<input id="adminUserUsername" required placeholder="ex.: lider_adm_campinas" /></label>' +
        '<label>Nome de exibicao<input id="adminUserDisplayName" required placeholder="ex.: Lider Administrativo Campinas" /></label>' +
        '<label>E-mail<input id="adminUserEmail" type="email" placeholder="opcional" /></label>' +
        '<label>Senha provisoria<input id="adminUserPassword" type="password" required placeholder="min. 10 caracteres com simbolo" /></label>' +
        '<label>Empresa (tenant key)<input id="adminUserTenantKey" placeholder="ex.: tagus_tec" /></label>' +
        '<label>Unidade (unit key)<input id="adminUserUnitKey" placeholder="ex.: campinas" /></label>' +
        '<label>Perfil' +
        '<select id="adminUserRole">' +
        '<option value="lider_administrativo">Lider Administrativo</option>' +
        '<option value="lider_tecnico">Lider Tecnico</option>' +
        '<option value="admin">Administrador</option>' +
        '</select>' +
        '</label>' +
        '<div class="admin-users-toggle-wrap">' +
        '<label class="admin-users-toggle"><input id="adminUserActive" type="checkbox" checked /> Usuario ativo</label>' +
        '<label class="admin-users-toggle"><input id="adminUserForceChange" type="checkbox" checked /> Forcar troca de senha no primeiro acesso</label>' +
        '</div>' +
        '</div>' +
        '<div class="admin-users-perm-box">' +
        '<div class="admin-users-perm-head">' +
        '<strong>Permissoes de menu</strong>' +
        '<button type="button" id="adminUsersApplyRoleTemplate" class="admin-users-small-btn">Aplicar padrao do perfil</button>' +
        '</div>' +
        '<div id="adminUserPermissions" class="admin-users-perm-grid"></div>' +
        '</div>' +
        '<div class="admin-users-actions">' +
        '<button id="adminUsersSubmit" class="btn-primary" type="submit">Salvar usuario</button>' +
        '<span id="adminUsersStatus" class="admin-users-status"></span>' +
        '</div>' +
        '</form>' +
        '<div class="admin-users-list-box">' +
        '<h4>Usuarios cadastrados</h4>' +
        '<div class="admin-users-table-wrap">' +
        '<table class="admin-users-table">' +
        '<thead><tr><th>Usuario</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Escopo</th><th>Permissoes de menu</th></tr></thead>' +
        '<tbody id="adminUsersTableBody"><tr><td colspan="6">Carregando...</td></tr></tbody>' +
        '</table>' +
        '</div>' +
        '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }

    buildPermissionsChecklist();
    const roleInput = document.getElementById('adminUserRole');
    if (roleInput) roleInput.value = 'lider_administrativo';
    applyRoleTemplate();

    document.body.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.getAttribute('data-close-users-modal') === '1') closeUsersModal();
      if (target.getAttribute('data-close-panel-settings') === '1') closeSettingsModal();
    });

    const form = document.getElementById('adminUsersForm');
    if (form) form.addEventListener('submit', handleCreateUser);
    const applyRoleBtn = document.getElementById('adminUsersApplyRoleTemplate');
    if (applyRoleBtn) applyRoleBtn.addEventListener('click', applyRoleTemplate);
    const roleSelect = document.getElementById('adminUserRole');
    if (roleSelect) roleSelect.addEventListener('change', applyRoleTemplate);

    usersModalReady = true;
  }

  function ensureSettingsModal() {
    if (settingsModalReady) return;
    let modal = document.getElementById('panelSettingsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'panelSettingsModal';
      modal.className = 'admin-users-modal panel-settings-modal';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML =
        '<div class="admin-users-backdrop" data-close-panel-settings="1"></div>' +
        '<div class="admin-users-panel panel-settings-panel">' +
        '<div class="admin-users-head">' +
        '<h3>Configuracoes do Painel</h3>' +
        '<button type="button" class="admin-users-close" data-close-panel-settings="1">Fechar</button>' +
        '</div>' +
        '<div class="panel-settings-grid">' +
        '<div class="panel-settings-card">' +
        '<span class="panel-settings-label">Auto save</span>' +
        '<strong id="settingsAutoSavePrimary">Auto save ativo</strong>' +
        '<small id="settingsAutoSaveSecondary">As alteracoes sao salvas automaticamente.</small>' +
        '</div>' +
        '<div class="panel-settings-card">' +
        '<span class="panel-settings-label">Acoes manuais</span>' +
        '<div class="panel-settings-actions">' +
        '<button id="settingsManualSaveBtn" type="button" class="btn-primary">Salvar manual agora</button>' +
        '<button id="settingsRuntimeBtn" type="button" class="btn-light">Consultar base compartilhada</button>' +
        '<button id="settingsAuditBtn" type="button" class="btn-light">Atualizar auditoria</button>' +
        '<button id="settingsUsersBtn" type="button" class="btn-dark">Gestao de usuarios</button>' +
        '</div>' +
        '<small id="panelSettingsStatus" class="panel-settings-status"></small>' +
        '</div>' +
        '<div class="panel-settings-card" id="panelOrgCard">' +
        '<span class="panel-settings-label">Empresa e unidade</span>' +
        '<div class="panel-smtp-grid">' +
        '<label>Nome da empresa<input id="panelOrgCompanyName" placeholder="Tagus-Tec" /></label>' +
        '<label>Tenant key<input id="panelOrgTenantKey" placeholder="tagus_tec" /></label>' +
        '<label>Nome da unidade<input id="panelOrgUnitName" placeholder="Campinas" /></label>' +
        '<label>Unit key<input id="panelOrgUnitKey" placeholder="campinas" /></label>' +
        '<label>Timezone<input id="panelOrgTimezone" placeholder="America/Sao_Paulo" /></label>' +
        '<label>Idioma padrao<select id="panelOrgLocaleDefault"><option value="pt-BR">pt-BR</option><option value="en-US">en-US</option></select></label>' +
        '</div>' +
        '<div class="panel-settings-actions">' +
        '<button id="panelOrgSaveBtn" type="button" class="btn-primary">Salvar empresa/unidade</button>' +
        '</div>' +
        '<small id="panelOrgStatus" class="panel-settings-status"></small>' +
        '</div>' +
        '<div class="panel-settings-card" id="panelSmtpCard">' +
        '<span class="panel-settings-label">SMTP e recuperacao</span>' +
        '<div class="panel-smtp-grid">' +
        '<label>Ativar SMTP<input id="panelSmtpEnabled" type="checkbox" /></label>' +
        '<label>Host<input id="panelSmtpHost" placeholder="smtp.gmail.com" /></label>' +
        '<label>Porta<input id="panelSmtpPort" type="number" min="1" max="65535" value="587" /></label>' +
        '<label>SSL direto (465)<input id="panelSmtpSecure" type="checkbox" /></label>' +
        '<label>Usuario SMTP<input id="panelSmtpUser" type="email" placeholder="usuario@empresa.com" /></label>' +
        '<label>Senha SMTP<input id="panelSmtpPass" type="password" placeholder="Senha ou app password" autocomplete="new-password" /></label>' +
        '<label>E-mail remetente (From)<input id="panelSmtpFrom" type="email" placeholder="usuario@empresa.com" /></label>' +
        '<label>E-mail para teste<input id="panelSmtpTestTo" type="email" placeholder="seuemail@empresa.com" /></label>' +
        '</div>' +
        '<div class="panel-settings-actions">' +
        '<button id="panelSmtpPresetGmailBtn" type="button" class="btn-light">Usar preset Gmail</button>' +
        '<button id="panelSmtpSaveBtn" type="button" class="btn-primary">Salvar SMTP</button>' +
        '<button id="panelSmtpTestBtn" type="button" class="btn-light">Testar envio SMTP</button>' +
        '</div>' +
        '<small id="panelSmtpStatus" class="panel-settings-status"></small>' +
        '</div>' +
        '</div>' +
        '</div>';
      document.body.appendChild(modal);
    }

    const manualBtn = document.getElementById('settingsManualSaveBtn');
    if (manualBtn) manualBtn.addEventListener('click', handleManualSaveNow);

    const runtimeBtn = document.getElementById('settingsRuntimeBtn');
    if (runtimeBtn) runtimeBtn.addEventListener('click', function () {
      if (typeof window.openRuntimeHub === 'function') window.openRuntimeHub();
      setSettingsStatus('', false);
    });

    const auditBtn = document.getElementById('settingsAuditBtn');
    if (auditBtn) auditBtn.addEventListener('click', function () {
      if (typeof window.refreshAuditTrail === 'function') window.refreshAuditTrail();
      setSettingsStatus('Auditoria atualizada.', false);
    });

    const usersBtn = document.getElementById('settingsUsersBtn');
    if (usersBtn) usersBtn.addEventListener('click', function () {
      if (!isAdmin()) {
        setSettingsStatus('Somente admin pode abrir gestao de usuarios.', true);
        return;
      }
      closeSettingsModal();
      openUsersModal();
    });

    const smtpSaveBtn = document.getElementById('panelSmtpSaveBtn');
    if (smtpSaveBtn) smtpSaveBtn.addEventListener('click', handleSaveSmtpConfig);
    const orgSaveBtn = document.getElementById('panelOrgSaveBtn');
    if (orgSaveBtn) orgSaveBtn.addEventListener('click', handleSaveOrgConfig);
    const smtpPresetBtn = document.getElementById('panelSmtpPresetGmailBtn');
    if (smtpPresetBtn) smtpPresetBtn.addEventListener('click', applyGmailPreset);
    const smtpTestBtn = document.getElementById('panelSmtpTestBtn');
    if (smtpTestBtn) smtpTestBtn.addEventListener('click', handleTestSmtpConfig);

    settingsModalReady = true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureUsersModal();
    ensureSettingsModal();

    window.setInterval(function () {
      if (document.getElementById('panelSettingsModal')?.classList.contains('is-open')) refreshSettingsSummary();
    }, 1200);
  });

  window.openAdminUsersModal = openUsersModal;
  window.openPanelSettingsModal = openSettingsModal;
})();
