/* =================================================================
   Notifications — daily reminders to review.
   - Uses Web Notifications API when permitted; otherwise shows an
     in-app toast banner.
   - Checks every minute against the user's chosen reminder time and
     fires once per day.
   ================================================================= */
(function (global) {
  'use strict';
  const { toast, icons, todayKey } = global.U;

  const Notifications = {
    timer: null,

    isSupported() { return 'Notification' in window; },

    permission() {
      return this.isSupported() ? Notification.permission : 'unsupported';
    },

    async requestPermission() {
      if (!this.isSupported()) return 'unsupported';
      try {
        const result = await Notification.requestPermission();
        global.State.set('settings.reminders.permission', result);
        return result;
      } catch { return 'denied'; }
    },

    setEnabled(enabled) {
      global.State.set('settings.reminders.enabled', !!enabled);
      this.start();
    },

    setTime(hhmm) {
      global.State.set('settings.reminders.time', hhmm || '19:00');
    },

    /** Manually trigger a reminder (used for testing) */
    fireNow() { this._maybeNotify(true); },

    start() {
      if (this.timer) clearInterval(this.timer);
      this._tick();
      this.timer = setInterval(() => this._tick(), 60 * 1000);
    },

    _tick() {
      const r = global.State.S.settings.reminders;
      if (!r?.enabled) return;
      const [hh, mm] = (r.time || '19:00').split(':').map(Number);
      const now = new Date();
      // fire if it's >= scheduled time and not already fired today
      if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)) {
        this._maybeNotify(false);
      }
    },

    _maybeNotify(force) {
      const today = todayKey();
      const last = global.State.S.settings.lastReminderShown;
      if (!force && last === today) return;

      const due = global.SRS.summary(global.State.S.vocab).due;
      const missed = global.State.S.review.lastReviewedDay && global.State.S.review.lastReviewedDay !== today;

      const settings = global.State.S.settings.reminders;
      let title = 'Time to review';
      let body  = due ? `${due} word${due === 1 ? '' : 's'} are ready for you.`
                      : 'Add a few new words today and keep the streak.';
      if (missed && settings.notifyMissed && due) {
        title = 'You missed yesterday';
        body  = `Review ${due} word${due === 1 ? '' : 's'} to keep the streak alive.`;
      }

      // Web notification if granted
      if (this.isSupported() && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            icon: 'app_logo.png',
            tag: 'frenmot-reminder',
            silent: false
          });
          n.onclick = () => { window.focus(); window.location.hash = '#/review'; n.close(); };
        } catch { /* fallback below */ }
      } else {
        // In-app banner
        showBanner(title, body);
      }

      // Topbar dot indicator
      const dot = document.getElementById('notif-dot');
      if (dot) dot.hidden = false;

      global.State.set('settings.lastReminderShown', today);
    }
  };

  function showBanner(title, body) {
    toast(`${title} — ${body}`, 'info', 6000);
  }

  global.Notifications = Notifications;
})(window);
