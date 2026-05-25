/* =================================================================
   Theme — light/dark mode + accent color, with system-preference
   support and persistence via app state.
   ================================================================= */
(function (global) {
  'use strict';
  const { bus } = global.U;

  const Theme = {
    apply() {
      const s = global.State.S.settings;
      const html = document.documentElement;
      let mode = s.theme;
      if (mode === 'system') {
        mode = matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      html.setAttribute('data-theme', mode);
      html.setAttribute('data-accent', s.accent || 'indigo');
      // Update theme-color meta for mobile browser chrome
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', mode === 'dark' ? '#0b1020' : '#ffffff');
      }
    },

    setMode(mode) {
      global.State.set('settings.theme', mode);
      Theme.apply();
      bus.emit('theme:change', { mode });
    },

    toggle() {
      const cur = global.State.S.settings.theme === 'dark' ? 'light' : 'dark';
      Theme.setMode(cur);
    },

    setAccent(name) {
      global.State.set('settings.accent', name);
      Theme.apply();
    },

    init() {
      Theme.apply();
      // Re-apply when system preference changes
      if (matchMedia) {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener && mq.addEventListener('change', () => {
          if (global.State.S.settings.theme === 'system') Theme.apply();
        });
      }
    }
  };

  global.Theme = Theme;
})(window);
