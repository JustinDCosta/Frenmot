/* =================================================================
   Auth — local-only account model (no server). Stores a user record
   in app state. The "logged in" check just verifies a user exists.
   ================================================================= */
(function (global) {
  'use strict';
  const { uuid, bus } = global.U;

  const Auth = {
    isLoggedIn() { return !!global.State.S.user; },

    async login({ name, email, targetLang }) {
      if (!name || !name.trim()) throw new Error('Please enter a name.');
      const user = {
        id: uuid(),
        name: name.trim().slice(0, 40),
        email: (email || '').trim(),
        targetLang: targetLang || 'fr',
        createdAt: Date.now()
      };
      global.State.update(s => {
        s.user = user;
        s.settings.targetLang = targetLang || s.settings.targetLang || 'fr';
      });
      bus.emit('auth:login', user);
      return user;
    },

    /** Clear the local user record and synchronously flush state so
     *  callers that immediately reload don't race the debounced save.
     *  Returns true on success, false if state write failed. */
    logout() {
      try {
        global.State.update(s => {
          s.user = null;
          if (s.chat) s.chat.messages = [];
        });
        if (typeof global.State.flush === 'function') global.State.flush();
        bus.emit('auth:logout');
        return true;
      } catch (err) {
        console.warn('[auth] logout failed:', err && err.message);
        return false;
      }
    },

    update(patch) {
      global.State.update(s => {
        s.user = { ...(s.user || {}), ...patch };
      });
      bus.emit('auth:update', global.State.S.user);
    },

    initials(name) {
      if (!name) return 'F';
      const parts = name.trim().split(/\s+/);
      return ((parts[0] && parts[0][0]) + (parts[1] && parts[1][0] || '')).toUpperCase() || 'F';
    }
  };

  global.Auth = Auth;
})(window);
