/* =================================================================
   App — entry point. Initializes theme, i18n, auth screen, router,
   sidebar/topbar/bottom nav, and starts notifications.
   ================================================================= */
(function (global) {
  'use strict';
  const { $, $$, el, icons, toast, bus, debounce } = global.U;

  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const params = {};
    (query || '').split('&').filter(Boolean).forEach(p => {
      const [k, v] = p.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { path: path || 'dashboard', params };
  }

  const ROUTES = ['dashboard','vocabulary','review','learn','chat','pdf','conjugation','settings'];

  function navigateTo(name, params) {
    if (!ROUTES.includes(name)) name = 'dashboard';
    let target = '#/' + name;
    if (params && typeof params === 'object') {
      const qs = Object.keys(params).map(k =>
        encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
      if (qs) target += '?' + qs;
    }
    // If the hash is already the target, hashchange won't fire — render manually.
    if (location.hash === target) renderRoute();
    else location.hash = target;
  }

  function renderRoute() {
    if (!global.Auth.isLoggedIn()) {
      showAuth();
      return;
    }
    showShell();
    const { path, params } = parseHash();
    const main = document.getElementById('main');
    if (!ROUTES.includes(path)) { navigateTo('dashboard'); return; }

    setActiveNav(path);
    document.title = 'Frenmot — ' + path.charAt(0).toUpperCase() + path.slice(1);

    switch (path) {
      case 'dashboard':   global.Dashboard.renderView(main); break;
      case 'vocabulary':  global.Vocab.renderView(main); break;
      case 'review':      global.Learn.renderReviewView(main); break;
      case 'learn':       global.Learn.renderView(main, params); break;
      case 'chat':        global.Chat.renderView(main); break;
      case 'pdf':         global.PDF.renderView(main); break;
      case 'conjugation': global.ConjView.renderView(main); break;
      case 'settings':    global.Settings.renderView(main); break;
    }

    // Close mobile drawer if open
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-backdrop')?.remove();
  }

  /** Centralized logout. Confirms, calls Auth.logout(), hides the shell,
   *  resets the URL, and clears the protected main container. */
  async function performLogout({ skipConfirm = false } = {}) {
    if (!global.Auth.isLoggedIn()) { showAuth(); return false; }
    if (!skipConfirm) {
      const ok = await global.U.confirmModal({
        title:   global.I18n.t('settings.logOutConfirm.title'),
        message: global.I18n.t('settings.logOutConfirm.body'),
        confirmLabel: global.I18n.t('settings.logOut'),
        danger: true
      });
      if (!ok) return false;
    }
    const success = global.Auth.logout();
    if (!success) { global.U.toast('Logout failed. Please try again.', 'error'); return false; }
    showAuth();
    if (location.hash && location.hash !== '#/') {
      try { history.replaceState(null, '', location.pathname + '#/'); }
      catch { location.hash = '#/'; }
    }
    const main = document.getElementById('main');
    if (main) main.innerHTML = '';
    global.U.toast(global.I18n.t('auth.loggedOut') || 'Logged out', 'success', 2000);
    return true;
  }

  function setActiveNav(path) {
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === path));
    $$('.bnav-item').forEach(n => n.classList.toggle('active', n.dataset.route === path));
  }

  function refreshChrome() {
    const s = global.State.S;
    const summary = global.SRS.summary(s.vocab);
    const navCount = document.getElementById('nav-vocab-count');
    if (navCount) navCount.textContent = String(summary.total);
    const navDue = document.getElementById('nav-due-count');
    if (navDue) {
      navDue.textContent = String(summary.due);
      navDue.dataset.zero = String(summary.due === 0);
    }
    const bnavDue = document.getElementById('bnav-due-count');
    if (bnavDue) {
      bnavDue.textContent = String(summary.due);
      bnavDue.hidden = summary.due === 0;
    }
    const streakCount = document.getElementById('streak-count');
    if (streakCount) streakCount.textContent = String(s.review.streak || 0);
    const sName = document.getElementById('sidebar-name');
    if (sName) sName.textContent = s.user?.name || 'Guest';
    const sMeta = document.getElementById('sidebar-meta');
    if (sMeta) sMeta.textContent = s.user?.email || (`Learning ${langName(s.settings.targetLang)}`);
    const sAv = document.getElementById('sidebar-avatar');
    if (sAv) sAv.textContent = global.Auth.initials(s.user?.name || '');
    refreshNavLabels();
  }

  function refreshNavLabels() {
    const map = {
      'dashboard':   'nav.dashboard',
      'vocabulary':  'nav.vocabulary',
      'review':      'nav.review',
      'learn':       'nav.practice',
      'chat':        'nav.tutor',
      'pdf':         'nav.pdf',
      'conjugation': 'nav.conjugation',
      'settings':    'nav.settings'
    };
    document.querySelectorAll('.nav-item').forEach(node => {
      const route = node.dataset.route;
      const key = map[route]; if (!key) return;
      const span = node.querySelector('span:not(.nav-badge)');
      if (span) span.textContent = global.I18n.t(key);
    });
    const bnavMap = {
      'dashboard':'nav.home', 'vocabulary':'nav.vocab', 'review':'nav.review',
      'chat':'nav.tutorShort', 'settings':'nav.more'
    };
    document.querySelectorAll('.bnav-item').forEach(node => {
      const route = node.dataset.route;
      const key = bnavMap[route]; if (!key) return;
      const span = node.querySelector('span:not(.bnav-badge)');
      if (span) span.textContent = global.I18n.t(key);
    });
    const search = document.getElementById('global-search');
    if (search) search.placeholder = global.I18n.t('topbar.searchPlaceholder');
    document.documentElement.setAttribute('lang', global.I18n.current());
  }

  function langName(code) {
    return ({ fr:'French', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese',
              ja:'Japanese', ko:'Korean', zh:'Chinese' })[code] || code;
  }

  /* ----- Auth flow ----- */
  function showAuth() {
    document.getElementById('auth-screen').hidden = false;
    document.getElementById('app-shell').hidden = true;
  }
  function showShell() {
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
  }

  function bindAuth() {
    const form = document.getElementById('auth-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('auth-name').value;
      const email = document.getElementById('auth-email').value;
      const lang = document.getElementById('auth-lang').value;
      try {
        await global.Auth.login({ name, email, targetLang: lang });
        showShell();
        navigateTo('dashboard');
        refreshChrome();
        toast(`Welcome, ${global.State.S.user.name}!`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  /* ----- Profile menu (sidebar bottom) ----- */
  function openProfileMenu(anchor) {
    document.querySelectorAll('.profile-menu').forEach(n => n.remove());
    const menu = document.createElement('div');
    menu.className = 'profile-menu';
    const items = [
      { label: global.I18n.t('nav.settings'), icon: global.U.icons.settings, onClick: () => navigateTo('settings') },
      { label: global.I18n.t('settings.logOut'), icon: global.U.icons.lock, danger: true, onClick: () => performLogout() }
    ];
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'profile-menu-item' + (it.danger ? ' danger' : '');
      b.innerHTML = it.icon + '<span>' + global.U.escapeHtml(it.label) + '</span>';
      b.addEventListener('click', () => { close(); it.onClick(); });
      menu.appendChild(b);
    });
    const rect = anchor.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    document.body.appendChild(menu);

    function close() {
      menu.remove();
      document.removeEventListener('click', onAway, true);
      document.removeEventListener('keydown', onEsc);
    }
    function onAway(ev) {
      if (!menu.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) close();
    }
    function onEsc(ev) { if (ev.key === 'Escape') close(); }
    setTimeout(() => document.addEventListener('click', onAway, true), 0);
    document.addEventListener('keydown', onEsc);
  }

  /* ----- Sidebar / topbar wiring ----- */
  function bindShell() {
    const themeBtn = document.getElementById('theme-toggle-btn');
    themeBtn?.addEventListener('click', () => global.Theme.toggle());

    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const cur = global.I18n.current();
        global.I18n.set(cur === 'en' ? 'fr' : 'en');
      });
      const refreshLangBtn = () => {
        langBtn.textContent = global.I18n.current().toUpperCase();
        langBtn.setAttribute('aria-label', global.I18n.t('topbar.language') + ': ' + langBtn.textContent);
      };
      refreshLangBtn();
      bus.on('i18n:change', refreshLangBtn);
    }

    const menuBtn = document.getElementById('mobile-menu-btn');
    menuBtn?.addEventListener('click', () => {
      const sb = document.querySelector('.sidebar');
      if (!sb) return;
      sb.classList.toggle('open');
      document.querySelector('.sidebar-backdrop')?.remove();
      if (sb.classList.contains('open')) {
        const bd = document.createElement('div');
        bd.className = 'sidebar-backdrop';
        bd.addEventListener('click', () => { sb.classList.remove('open'); bd.remove(); });
        document.body.appendChild(bd);
      }
    });

    const profile = document.getElementById('profile-btn');
    profile?.addEventListener('click', () => openProfileMenu(profile));

    const search = document.getElementById('global-search');
    search?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = search.value.trim();
        if (!q) return;
        location.hash = '#/vocabulary?q=' + encodeURIComponent(q);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); search?.focus();
      }
    });

    document.getElementById('streak-pill')?.addEventListener('click', () => navigateTo('dashboard'));

    document.getElementById('notif-btn')?.addEventListener('click', async () => {
      const r = global.State.S.settings.reminders;
      if (!r.enabled) { navigateTo('settings'); toast('Enable reminders in Settings', 'info'); return; }
      global.Notifications.fireNow();
      const dot = document.getElementById('notif-dot'); if (dot) dot.hidden = true;
    });
  }

  /* ----- Init ----- */
  function init() {
    global.Theme.init();
    global.I18n.init();
    bindAuth();
    bindShell();

    if (!global.Auth.isLoggedIn()) {
      showAuth();
    } else {
      showShell();
      if (!location.hash) navigateTo('dashboard');
      else renderRoute();
      refreshChrome();
      global.Notifications.start();
    }

    window.addEventListener('hashchange', renderRoute);

    bus.on('state:change', debounce(refreshChrome, 60));
    bus.on('state:reset', () => { refreshChrome(); renderRoute(); });
    bus.on('vocab:change', () => {
      refreshChrome();
      const { path } = parseHash();
      if (['dashboard','vocabulary','review','learn'].includes(path)) renderRoute();
    });
    bus.on('auth:login', () => { refreshChrome(); global.Notifications.start(); });
    bus.on('auth:logout', () => {
      const main = document.getElementById('main');
      if (main) main.innerHTML = '';
      showAuth();
    });
    bus.on('i18n:change', () => { refreshChrome(); renderRoute(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging and cross-module use
  global.App = { renderRoute, navigateTo, refreshChrome, performLogout };
})(window);
