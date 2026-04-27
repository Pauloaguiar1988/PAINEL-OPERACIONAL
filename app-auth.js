(function () {
  const TOKEN_KEY = 'ccoi_auth_token_v2';
  const USER_KEY = 'ccoi_auth_user_v2';
  const TOKEN_KEY_V1 = 'ccoi_auth_token_v1';
  const USER_KEY_V1 = 'ccoi_auth_user_v1';
  const REMEMBER_KEY = 'ccoi_auth_remember_v1';
  const ACTIVITY_KEY = 'ccoi_auth_activity_v1';
  const UI_LANGUAGE_KEY = 'ccoi_ui_language_v1';
  const SESSION_TIMEOUT_DEFAULT_MS = 60 * 60 * 1000;
  const ACTIVITY_THROTTLE_MS = 8000;

  const ROLE_LABELS = {
    pt: {
      admin: 'Administrador',
      lider_tecnico: 'Lider Tecnico',
      lider_administrativo: 'Lider Administrativo'
    },
    en: {
      admin: 'Administrator',
      lider_tecnico: 'Technical Lead',
      lider_administrativo: 'Administrative Lead'
    }
  };

  const I18N = {
    pt: {
      language: 'Idioma',
      loginKicker: 'Tagus-Tec Campinas',
      loginTitle: 'Acesso ao Painel',
      loginHelp: 'Entre com usuario e senha para abrir os menus conforme seu perfil.',
      username: 'Usuario',
      password: 'Senha',
      remember: 'Salvar acesso neste navegador',
      forgot: 'Esqueci minha senha',
      loginButton: 'Entrar',
      forgotTitle: 'Recuperar senha',
      forgotHelp: 'Informe usuario ou e-mail cadastrado para receber o codigo.',
      identifier: 'Usuario ou e-mail',
      sendCode: 'Enviar codigo',
      resetTitle: 'Redefinir senha',
      resetHelp: 'Digite o codigo recebido e cadastre a nova senha.',
      code: 'Codigo de recuperacao',
      newPassword: 'Nova senha',
      resetButton: 'Atualizar senha',
      backToLogin: 'Voltar para login',
      logout: 'Sair',
      sessionExpires: 'Sessao por inatividade',
      timeoutLabel: '60 min',
      loginRequired: 'Sessao encerrada. Entre novamente.',
      inactivityLogout: 'Sessao encerrada por 1 hora sem atividade.',
      loginSuccess: 'Acesso liberado para ',
      invalidAuth: 'Falha de autenticacao.'
    },
    en: {
      language: 'Language',
      loginKicker: 'Tagus-Tec Campinas',
      loginTitle: 'Access Portal',
      loginHelp: 'Sign in to open menus based on your profile.',
      username: 'Username',
      password: 'Password',
      remember: 'Remember this browser',
      forgot: 'Forgot my password',
      loginButton: 'Sign in',
      forgotTitle: 'Recover password',
      forgotHelp: 'Enter your username or registered email to receive a code.',
      identifier: 'Username or email',
      sendCode: 'Send code',
      resetTitle: 'Reset password',
      resetHelp: 'Enter the code and set your new password.',
      code: 'Recovery code',
      newPassword: 'New password',
      resetButton: 'Update password',
      backToLogin: 'Back to login',
      logout: 'Sign out',
      sessionExpires: 'Inactivity session',
      timeoutLabel: '60 min',
      loginRequired: 'Session expired. Please sign in again.',
      inactivityLogout: 'Session ended after 1 hour of inactivity.',
      loginSuccess: 'Access granted to ',
      invalidAuth: 'Authentication failed.'
    }
  };

  const ALL_SECTIONS = [
    'painel',
    'operacao',
    'agenda',
    'tecnico',
    'administrativo',
    'diagnostico',
    'resultado',
    'executivo',
    'negocio',
    'melhorias',
    'historico'
  ];

  const ROLE_SECTIONS = {
    admin: ALL_SECTIONS.slice(),
    lider_tecnico: ['painel', 'agenda', 'tecnico'],
    lider_administrativo: ['painel', 'agenda', 'administrativo']
  };

  let currentUser = null;
  let authLang = 'pt';
  let authMode = 'login';
  let sessionTimeoutMs = SESSION_TIMEOUT_DEFAULT_MS;
  let lastUserActivityAt = Date.now();
  let activityLastBroadcastAt = 0;
  let activityTimerId = 0;
  let lastSessionSetAt = 0;

  function readStoredLanguage() {
    try {
      const stored = String(localStorage.getItem(UI_LANGUAGE_KEY) || sessionStorage.getItem(UI_LANGUAGE_KEY) || '').toLowerCase();
      if (stored.startsWith('en')) return 'en';
    } catch (_) {}
    const htmlLang = String(document.documentElement?.lang || '').toLowerCase();
    if (htmlLang.startsWith('en')) return 'en';
    return 'pt';
  }

  function setUiLanguage(nextLang) {
    const normalized = nextLang === 'en' ? 'en' : 'pt';
    authLang = normalized;
    try {
      localStorage.setItem(UI_LANGUAGE_KEY, normalized);
      sessionStorage.setItem(UI_LANGUAGE_KEY, normalized);
    } catch (_) {}
    document.documentElement.lang = normalized === 'en' ? 'en-US' : 'pt-BR';
    window.dispatchEvent(new CustomEvent('panel-language-changed', {
      detail: {
        language: document.documentElement.lang
      }
    }));
  }

  authLang = readStoredLanguage();

  function getText(key) {
    const bundle = I18N[authLang] || I18N.pt;
    return bundle[key] || key;
  }

  function safeParse(jsonText, fallback) {
    try {
      const parsed = JSON.parse(String(jsonText || ''));
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function isRememberEnabled() {
    try {
      return localStorage.getItem(REMEMBER_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function setRememberEnabled(enabled) {
    try {
      localStorage.setItem(REMEMBER_KEY, enabled ? '1' : '0');
    } catch (_) {}
  }

  function getStoredSession() {
    try {
      const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY_V1) || '';
      if (token) {
        return {
          token,
          user: safeParse(localStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY_V1), {})
        };
      }
    } catch (_) {}

    try {
      const token = sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY_V1) || '';
      if (token) {
        return {
          token,
          user: safeParse(sessionStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY_V1), {})
        };
      }
    } catch (_) {}

    return { token: '', user: null };
  }

  function setSession(token, user, remember) {
    const useRemember = !!remember;
    setRememberEnabled(useRemember);
    const userText = JSON.stringify(user || {});

    try {
      if (useRemember) {
        localStorage.setItem(TOKEN_KEY, token || '');
        localStorage.setItem(USER_KEY, userText);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
      } else {
        sessionStorage.setItem(TOKEN_KEY, token || '');
        sessionStorage.setItem(USER_KEY, userText);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
      localStorage.removeItem(TOKEN_KEY_V1);
      localStorage.removeItem(USER_KEY_V1);
      sessionStorage.removeItem(TOKEN_KEY_V1);
      sessionStorage.removeItem(USER_KEY_V1);
    } catch (_) {}
    lastSessionSetAt = Date.now();
    emitAuthChangedEvent();
    try {
      if (typeof window.refreshGodMode === 'function') window.refreshGodMode();
    } catch (_) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY_V1);
      localStorage.removeItem(USER_KEY_V1);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY_V1);
      sessionStorage.removeItem(USER_KEY_V1);
    } catch (_) {}
    lastSessionSetAt = 0;
    emitAuthChangedEvent();
  }

  function getToken() {
    return getStoredSession().token || '';
  }

  function emitAuthChangedEvent() {
    try {
      const stored = getStoredSession();
      window.dispatchEvent(new CustomEvent('panel-auth-changed', {
        detail: {
          authenticated: !!stored.token,
          user: stored.user || null
        }
      }));
    } catch (_) {}
  }

  function updateActivityTimestamp(force) {
    const now = Date.now();
    if (!force && now - lastUserActivityAt < ACTIVITY_THROTTLE_MS) return;
    lastUserActivityAt = now;

    try {
      if (now - activityLastBroadcastAt > ACTIVITY_THROTTLE_MS) {
        localStorage.setItem(ACTIVITY_KEY, String(now));
        activityLastBroadcastAt = now;
      }
    } catch (_) {}
  }

  function getRoleLabel(role) {
    const labels = ROLE_LABELS[authLang] || ROLE_LABELS.pt;
    return labels[role] || role || '';
  }

  window.getPanelAuthToken = function () {
    return getToken();
  };

  window.getPanelCurrentUser = function () {
    return currentUser ? { ...currentUser } : null;
  };

  (function patchFetchWithAuthToken() {
    if (typeof window.fetch !== 'function') return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
      const isApiCall = requestUrl.startsWith('/api/');
      const isLoginCall = requestUrl.startsWith('/api/auth/login');
      if (!isApiCall || isLoginCall) {
        return nativeFetch(input, init);
      }

      const token = getToken();
      if (!token) return nativeFetch(input, init);

      const opts = Object.assign({}, init || {});
      const headers = Object.assign({}, opts.headers || {});
      if (!headers['x-auth-token']) headers['x-auth-token'] = token;
      if (!headers['x-panel-lang']) headers['x-panel-lang'] = authLang === 'en' ? 'en-US' : 'pt-BR';
      if (Date.now() - lastUserActivityAt <= sessionTimeoutMs) {
        headers['x-user-active-at'] = String(lastUserActivityAt);
      }
      opts.headers = headers;
      return nativeFetch(input, opts);
    };
  })();

  function sanitizeSections(rawSections, fallbackRole) {
    const incoming = Array.isArray(rawSections) ? rawSections : [];
    const allowed = new Set(ALL_SECTIONS);
    const clean = [];
    incoming.forEach(section => {
      const key = String(section || '').trim().toLowerCase();
      if (!allowed.has(key)) return;
      if (!clean.includes(key)) clean.push(key);
    });
    if (clean.length) return clean;
    return (ROLE_SECTIONS[fallbackRole] || ROLE_SECTIONS.lider_tecnico || []).slice();
  }

  function roleSections(role, rawSections) {
    return sanitizeSections(rawSections, role);
  }

  function sectionFromNav(nav) {
    if (!nav) return '';
    const onclick = nav.getAttribute('onclick') || '';
    const match = onclick.match(/show\('([^']+)'/);
    return match ? match[1] : '';
  }

  function navForSection(sectionId) {
    const navs = Array.from(document.querySelectorAll('.sidebar .nav'));
    return navs.find(nav => sectionFromNav(nav) === sectionId) || null;
  }

  function applyRoleAccess(user) {
    currentUser = user || null;
    const allowedSections = roleSections(user?.role, user?.menuPermissions);
    const allowed = new Set(allowedSections);

    document.querySelectorAll('.section').forEach(section => {
      section.style.display = allowed.has(section.id) ? '' : 'none';
    });

    document.querySelectorAll('.sidebar .nav').forEach(nav => {
      const sectionId = sectionFromNav(nav);
      if (!sectionId) return;
      nav.style.display = allowed.has(sectionId) ? '' : 'none';
    });

    const mobileSelect = document.getElementById('mobileSectionSelect');
    if (mobileSelect) {
      Array.from(mobileSelect.options).forEach(option => {
        const visible = allowed.has(option.value);
        option.hidden = !visible;
        option.disabled = !visible;
      });
    }

    const activeSection = document.querySelector('.section.active');
    if (!activeSection || !allowed.has(activeSection.id)) {
      const firstAllowed = allowedSections[0];
      if (firstAllowed && typeof window.show === 'function') {
        window.show(firstAllowed, navForSection(firstAllowed));
      }
    }

    renderUserChip(user);
  }

  function lockUI(locked) {
    document.body.classList.toggle('auth-locked', !!locked);
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.toggle('visible', !!locked);
  }

  window.onPanelAuthRequired = function () {
    const tokenPresent = !!getToken();
    if (tokenPresent && Date.now() - lastSessionSetAt < 6000) return;
    lockUI(true);
    showLoginMessage(getText('loginRequired'), 'error');
  };

  function authRequest(path, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) headers['x-auth-token'] = token;
    headers['x-panel-lang'] = authLang === 'en' ? 'en-US' : 'pt-BR';
    headers['x-user-active-at'] = String(lastUserActivityAt);

    return fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body
    }).then(async res => {
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || getText('invalidAuth'));
      return payload;
    });
  }

  function ensureOverlay() {
    let overlay = document.getElementById('authOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-top-row">
          <div class="auth-kicker" data-i18n="loginKicker"></div>
          <label class="auth-language-wrap">
            <span data-i18n="language"></span>
            <select id="authLanguageSelect">
              <option value="pt">PT-BR</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>

        <div id="authLoginBlock">
          <h2 data-i18n="loginTitle"></h2>
          <p data-i18n="loginHelp"></p>
          <form id="authLoginForm" autocomplete="on">
            <label data-i18n-label="username">Usuario
              <input id="authUsername" name="username" autocomplete="username" required />
            </label>
            <label data-i18n-label="password">Senha
              <input id="authPassword" name="password" type="password" autocomplete="current-password" required />
            </label>
            <label class="auth-remember">
              <input id="authRemember" type="checkbox" />
              <span data-i18n="remember"></span>
            </label>
            <div class="auth-actions-row">
              <button type="submit" class="auth-submit" data-i18n="loginButton"></button>
              <button type="button" class="auth-link-btn" id="authForgotBtn" data-i18n="forgot"></button>
            </div>
          </form>
        </div>

        <div id="authForgotBlock" class="auth-hidden">
          <h2 data-i18n="forgotTitle"></h2>
          <p data-i18n="forgotHelp"></p>
          <form id="authForgotForm" autocomplete="on">
            <label data-i18n-label="identifier">Usuario ou e-mail
              <input id="authIdentifier" name="identifier" autocomplete="username email" required />
            </label>
            <div class="auth-actions-row">
              <button type="submit" class="auth-submit" data-i18n="sendCode"></button>
              <button type="button" class="auth-link-btn" id="authBackToLoginBtn1" data-i18n="backToLogin"></button>
            </div>
          </form>
        </div>

        <div id="authResetBlock" class="auth-hidden">
          <h2 data-i18n="resetTitle"></h2>
          <p data-i18n="resetHelp"></p>
          <form id="authResetForm" autocomplete="off">
            <label data-i18n-label="identifier">Usuario ou e-mail
              <input id="authResetIdentifier" name="identifier" required />
            </label>
            <label data-i18n-label="code">Codigo de recuperacao
              <input id="authResetCode" name="code" inputmode="numeric" maxlength="10" required />
            </label>
            <label data-i18n-label="newPassword">Nova senha
              <input id="authResetPassword" name="password" type="password" minlength="8" required />
            </label>
            <div class="auth-actions-row">
              <button type="submit" class="auth-submit" data-i18n="resetButton"></button>
              <button type="button" class="auth-link-btn" id="authBackToLoginBtn2" data-i18n="backToLogin"></button>
            </div>
          </form>
        </div>

        <div id="authInfoNote" class="auth-info-note"></div>
        <div id="authError" class="auth-error" aria-live="polite"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function applyI18n() {
    const dict = I18N[authLang] || I18N.pt;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = dict[key] || key;
    });
    document.querySelectorAll('[data-i18n-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-label');
      const text = dict[key] || key;
      const firstText = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
      if (firstText) firstText.nodeValue = text + ' ';
    });
    const select = document.getElementById('authLanguageSelect');
    if (select) select.value = authLang;

    const chipRole = document.querySelector('#authUserChip .role');
    if (chipRole && currentUser) chipRole.textContent = getRoleLabel(currentUser.role);

    const logoutBtn = document.getElementById('authLogoutBtn');
    if (logoutBtn) logoutBtn.textContent = getText('logout');
    const timeoutEl = document.getElementById('authSessionTimeout');
    if (timeoutEl) timeoutEl.textContent = `${getText('sessionExpires')}: ${getText('timeoutLabel')}`;
    setUiLanguage(authLang);
  }

  function setAuthMode(nextMode) {
    authMode = nextMode;
    const loginBlock = document.getElementById('authLoginBlock');
    const forgotBlock = document.getElementById('authForgotBlock');
    const resetBlock = document.getElementById('authResetBlock');
    if (loginBlock) loginBlock.classList.toggle('auth-hidden', nextMode !== 'login');
    if (forgotBlock) forgotBlock.classList.toggle('auth-hidden', nextMode !== 'forgot');
    if (resetBlock) resetBlock.classList.toggle('auth-hidden', nextMode !== 'reset');
    showLoginMessage('', '');
  }

  function showLoginMessage(message, kind) {
    const noteEl = document.getElementById('authInfoNote');
    const errorEl = document.getElementById('authError');
    if (kind === 'info') {
      if (noteEl) noteEl.textContent = message || '';
      if (errorEl) errorEl.textContent = '';
      return;
    }
    if (kind === 'error') {
      if (errorEl) errorEl.textContent = message || '';
      if (noteEl) noteEl.textContent = '';
      return;
    }
    if (errorEl) errorEl.textContent = '';
    if (noteEl) noteEl.textContent = '';
  }

  function renderUserChip(user) {
    let chip = document.getElementById('authUserChip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'authUserChip';
      chip.className = 'auth-user-chip';
      chip.innerHTML = `
        <div class="auth-user-meta">
          <div class="name"></div>
          <div class="role"></div>
          <div class="timeout" id="authSessionTimeout"></div>
        </div>
        <button type="button" id="authLogoutBtn"></button>
      `;
      const header = document.querySelector('.header-clean') || document.querySelector('.content');
      if (header) header.appendChild(chip);
    }

    const nameEl = chip.querySelector('.name');
    const roleEl = chip.querySelector('.role');
    if (nameEl) nameEl.textContent = user?.displayName || user?.username || '';
    if (roleEl) {
      const role = getRoleLabel(user?.role);
      const unit = String(user?.unitName || user?.unitKey || '').trim();
      roleEl.textContent = unit ? `${role} • ${unit}` : role;
    }

    applyI18n();
  }

  function setSessionTimeoutFromPayload(payload) {
    const timeout = Number(payload?.inactivityTimeoutMs || payload?.timeout || SESSION_TIMEOUT_DEFAULT_MS);
    if (Number.isFinite(timeout) && timeout >= 5 * 60 * 1000) {
      sessionTimeoutMs = timeout;
    }
  }

  async function handleLogout(messageText) {
    try {
      await authRequest('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    clearSession();
    currentUser = null;
    lockUI(true);
    setAuthMode('login');
    if (messageText) showLoginMessage(messageText, 'info');
  }

  async function tryRestoreSession() {
    const stored = getStoredSession();
    if (!stored.token) return false;
    try {
      const me = await authRequest('/api/auth/me', { method: 'GET' });
      setSessionTimeoutFromPayload(me);
      setSession(stored.token, me.user, isRememberEnabled());
      applyRoleAccess(me.user);
      lockUI(false);
      try {
        window.setTimeout(() => {
          if (typeof window.refreshGodMode === 'function') window.refreshGodMode();
        }, 120);
      } catch (_) {}
      return true;
    } catch (_) {
      clearSession();
      return false;
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    updateActivityTimestamp(true);
    const username = (document.getElementById('authUsername')?.value || '').trim();
    const password = document.getElementById('authPassword')?.value || '';
    const remember = !!document.getElementById('authRemember')?.checked;
    const submitBtn = event.target.querySelector('button[type="submit"]');

    showLoginMessage('', '');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const payload = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }).then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const firstAccessByPayload = data?.requirePasswordChange === true;
          const firstAccessByStatus = res.status === 403;
          const firstAccessByMessage = /primeiro acesso|redefina sua senha/i.test(String(data?.error || ''));
          if (firstAccessByPayload || firstAccessByStatus || firstAccessByMessage) {
            return {
              requirePasswordChange: true,
              identifier: String(data.identifier || username || '').trim(),
              message: data.error || 'Primeiro acesso: redefina sua senha.'
            };
          }
          throw new Error(data.error || getText('invalidAuth'));
        }
        return data;
      });

      if (payload?.requirePasswordChange) {
        const identifierToUse = payload.identifier || username;
        const forgotId = document.getElementById('authIdentifier');
        const resetId = document.getElementById('authResetIdentifier');
        if (forgotId) forgotId.value = identifierToUse;
        if (resetId) resetId.value = identifierToUse;
        setAuthMode('forgot');
        showLoginMessage('Primeiro acesso detectado. Clique em "Enviar codigo" para redefinir sua senha.', 'info');
        return;
      }

      setSessionTimeoutFromPayload(payload);
      setSession(payload.token, payload.user, remember);
      applyRoleAccess(payload.user);
      lockUI(false);
      if (typeof window.notify === 'function') {
        window.notify(getText('loginSuccess') + (payload.user.displayName || payload.user.username) + '.');
      }
      try {
        if (typeof window.refreshGodMode === 'function') window.refreshGodMode();
      } catch (_) {}
    } catch (err) {
      showLoginMessage(err.message || getText('invalidAuth'), 'error');
      lockUI(true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      const pwd = document.getElementById('authPassword');
      if (pwd) pwd.value = '';
    }
  }

  async function handleForgotSubmit(event) {
    event.preventDefault();
    updateActivityTimestamp(true);
    const identifier = (document.getElementById('authIdentifier')?.value || '').trim();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    showLoginMessage('', '');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const payload = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      }).then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || getText('invalidAuth'));
        return data;
      });

      const info = payload?.message || 'Codigo enviado.';
      const hasEmail = payload?.channel === 'smtp' && payload?.sent === true;
      if (hasEmail) {
        const resetId = document.getElementById('authResetIdentifier');
        if (resetId) resetId.value = identifier;
        setAuthMode('reset');
        showLoginMessage(info + (payload?.maskedEmail ? ` (${payload.maskedEmail})` : ''), 'info');
      } else {
        setAuthMode('forgot');
        showLoginMessage(info, 'error');
      }
    } catch (err) {
      showLoginMessage(err.message || getText('invalidAuth'), 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    updateActivityTimestamp(true);
    const identifier = (document.getElementById('authResetIdentifier')?.value || '').trim();
    const code = (document.getElementById('authResetCode')?.value || '').trim();
    const newPassword = document.getElementById('authResetPassword')?.value || '';
    const submitBtn = event.target.querySelector('button[type="submit"]');

    showLoginMessage('', '');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, code, newPassword })
      }).then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || getText('invalidAuth'));
        return data;
      });

      setAuthMode('login');
      showLoginMessage(authLang === 'pt' ? 'Senha atualizada. Faça login.' : 'Password updated. Please sign in.', 'info');
    } catch (err) {
      showLoginMessage(err.message || getText('invalidAuth'), 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      const pwd = document.getElementById('authResetPassword');
      if (pwd) pwd.value = '';
    }
  }

  function checkInactivityLogout() {
    if (!getToken()) return;
    if (Date.now() - lastUserActivityAt <= sessionTimeoutMs) return;
    handleLogout(getText('inactivityLogout')).catch(() => {});
  }

  function bindActivityListeners() {
    ['pointerdown', 'keydown', 'touchstart', 'scroll', 'input', 'change'].forEach(eventName => {
      window.addEventListener(eventName, () => updateActivityTimestamp(false), { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updateActivityTimestamp(true);
    });

    window.addEventListener('storage', event => {
      if (event.key === ACTIVITY_KEY) {
        const next = Number(event.newValue || 0);
        if (Number.isFinite(next) && next > lastUserActivityAt) lastUserActivityAt = next;
      }
      if (event.key === TOKEN_KEY || event.key === TOKEN_KEY_V1) {
        if (!event.newValue) handleLogout(getText('loginRequired')).catch(() => {});
      }
    });
  }

  function wireAuthUi() {
    const languageSelect = document.getElementById('authLanguageSelect');
    if (languageSelect) {
      languageSelect.addEventListener('change', function () {
        setUiLanguage(this.value === 'en' ? 'en' : 'pt');
        applyI18n();
      });
    }

    const remember = document.getElementById('authRemember');
    if (remember) remember.checked = isRememberEnabled();

    const loginForm = document.getElementById('authLoginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

    const forgotForm = document.getElementById('authForgotForm');
    if (forgotForm) forgotForm.addEventListener('submit', handleForgotSubmit);

    const resetForm = document.getElementById('authResetForm');
    if (resetForm) resetForm.addEventListener('submit', handleResetSubmit);

    const forgotBtn = document.getElementById('authForgotBtn');
    if (forgotBtn) forgotBtn.addEventListener('click', () => setAuthMode('forgot'));

    const back1 = document.getElementById('authBackToLoginBtn1');
    if (back1) back1.addEventListener('click', () => setAuthMode('login'));

    const back2 = document.getElementById('authBackToLoginBtn2');
    if (back2) back2.addEventListener('click', () => setAuthMode('login'));

    document.body.addEventListener('click', function (event) {
      const target = event.target;
      if (target && target.id === 'authLogoutBtn') {
        handleLogout(getText('loginRequired')).catch(() => {});
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    setUiLanguage(authLang);
    ensureOverlay();
    applyI18n();
    lockUI(true);
    setAuthMode('login');
    bindActivityListeners();
    wireAuthUi();
    updateActivityTimestamp(true);

    if (activityTimerId) clearInterval(activityTimerId);
    activityTimerId = window.setInterval(checkInactivityLogout, 30000);

    const restored = await tryRestoreSession();
    if (!restored) {
      lockUI(true);
      showLoginMessage(getText('loginRequired'), 'info');
    }
  });

  window.getPanelUILanguage = function () {
    return authLang === 'en' ? 'en-US' : 'pt-BR';
  };
})();
