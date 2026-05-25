/* =================================================================
   App — entry point. Initializes theme, auth screen, router,
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

  const ROUTES = ['dashboard','vocabulary','review','learn','chat','pdf','settings'];

  function navigateTo(name) {
    if (!ROUTES.includes(name)) name = 'dashboard';
    location.hash = '#/' + name;
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
      case 'dashboard':  global.Dashboard.renderView(main); break;
      case 'vocabulary': global.Vocab.renderView(main); break;
      case 'review':     global.Learn.renderReviewView(main); break;
      case 'learn':      global.Learn.renderView(main, params); break;
      case 'chat':       global.Chat.renderView(main); break;
      case 'pdf':        global.PDF.renderView(main); break;
      case 'settings':   global.Settings.renderView(main); break;
    }

    // Close mobile drawer if open
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-backdrop')?.remove();
  }

  function setActiveNav(path) {
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === path));
    $$('.bnav-item').forEach(n => n.classList.toggle('active', n.dataset.route === path));
  }

  function refreshChrome() {
    const s = global.State.S;
    const summary = global.SRS.summary(s.vocab);
    // Sidebar counts
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
    // Streak
    const streakCount = document.getElementById('streak-count');
    if (streakCount) streakCount.textContent = String(s.review.streak || 0);
    // Profile
    const sName = document.getElementById('sidebar-name');
    if (sName) sName.textContent = s.user?.name || 'Guest';
    const sMeta = document.getElementById('sidebar-meta');
    if (sMeta) sMeta.textContent = s.user?.email || (`Learning ${langName(s.settings.targetLang)}`);
    const sAv = document.getElementById('sidebar-avatar');
    if (sAv) sAv.textContent = global.Auth.initials(s.user?.name || '');
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

  /* ----- Sidebar / topbar wiring ----- */
  function bindShell() {
    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    themeBtn?.addEventListener('click', () => global.Theme.toggle());

    // Mobile menu
    const menuBtn = document.getElementById('mobile-menu-btn');
    menuBtn?.addEventListener('click', () => {
      const sb = document.querySelector('.sidebar');
      if (!sb) return;
      sb.classList.toggle('open');
      // Backdrop
      document.querySelector('.sidebar-backdrop')?.remove();
      if (sb.classList.contains('open')) {
        const bd = document.createElement('div');
        bd.className = 'sidebar-backdrop';
        bd.addEventListener('click', () => { sb.classList.remove('open'); bd.remove(); });
        document.body.appendChild(bd);
      }
    });

    // Profile button -> settings
    const profile = document.getElementById('profile-btn');
    profile?.addEventListener('click', () => navigateTo('settings'));

    // Search
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

    // Streak pill — go to dashboard
    document.getElementById('streak-pill')?.addEventListener('click', () => navigateTo('dashboard'));

    // Notifications button — fire now if enabled, otherwise prompt
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

    // Re-render on route changes
    window.addEventListener('hashchange', renderRoute);

    // Refresh chrome on any state change
    bus.on('state:change', debounce(refreshChrome, 60));
    bus.on('state:reset', () => { refreshChrome(); renderRoute(); });
    bus.on('vocab:change', () => {
      refreshChrome();
      const { path } = parseHash();
      // Re-render relevant views to reflect new data
      if (['dashboard','vocabulary','review','learn'].includes(path)) renderRoute();
    });
    bus.on('auth:login', () => { refreshChrome(); global.Notifications.start(); });
    bus.on('auth:logout', showAuth);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  global.App = { renderRoute, navigateTo, refreshChrome };
})(window);
