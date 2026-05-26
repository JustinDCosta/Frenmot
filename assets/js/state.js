/* =================================================================
   State — central application state with versioned schema and
   automatic persistence (localStorage + IndexedDB mirror via U.storage).
   ================================================================= */
(function (global) {
  'use strict';
  const { storage, bus } = global.U;

  const SCHEMA_VERSION = 2;

  const DEFAULT_STATE = {
    version: SCHEMA_VERSION,
    user: null, // {id, name, email, avatar, targetLang, createdAt}
    settings: {
      theme: 'light',          // 'light' | 'dark' | 'system'
      accent: 'indigo',        // indigo | rose | emerald | amber | sky | violet
      sourceLang: 'en',
      targetLang: 'fr',
      uiLang: 'en',            // 'en' | 'fr' — interface language (i18n)
      defaultProvider: null,   // 'openai' | 'gemini' | 'groq' | 'nvidia'
      providers: {             // per-provider config (key obfuscated)
        openai: { keyEnc: '', model: 'gpt-4o-mini', baseUrl: '' },
        gemini: { keyEnc: '', model: 'gemini-2.0-flash', baseUrl: '' },
        groq:   { keyEnc: '', model: 'llama-3.3-70b-versatile', baseUrl: '' },
        nvidia: { keyEnc: '', model: 'meta/llama-3.1-70b-instruct', baseUrl: '' }
      },
      proxy: { enabled: false, url: '' }, // optional server proxy
      srs: {
        intervals: [1, 3, 7, 14, 30, 60], // days for "Good" levels
        newPerDay: 20,
        graduatingInterval: 1,
        easyBonus: 1.3,
        hardPenalty: 0.6
      },
      reminders: {
        enabled: false,
        time: '19:00',
        daily: true,
        notifyMissed: true,
        permission: 'default'
      },
      lastReminderShown: null
    },
    vocab: [],          // [Word]
    pdfs: [],           // [{id, name, addedAt, text, summary, pages}]
    /** User-saved PDF summaries (explicit "Save" button click).
     *  [{ id, docId, docName, content, savedAt, lang? }] */
    savedSummaries: [],
    chat: {
      messages: []      // [{id, role, content, ts, action?}]
    },
    review: {
      streak: 0,
      longestStreak: 0,
      lastReviewedDay: null,
      activeDays: [],    // ['YYYY-MM-DD']
      totalReviews: 0,
      correctReviews: 0
    },
    stats: {
      weekHistory: []    // [{day:'YYYY-MM-DD', reviewed:n, correct:n, added:n}]
    }
  };

  /** @typedef {{
   *   id:string, source:string, target:string,
   *   definition?:string, example?:string, examples?:string[],
   *   pos?:string, gender?:string, conjugation?:string,
   *   notes?:string, tags?:string[],
   *   difficulty?:number,                    // 1..5
   *   sourceType?:string,                    // manual | ai | pdf | preloaded
   *   createdAt:number, updatedAt:number,
   *   srs:{
   *     ease:number, interval:number, repetitions:number,
   *     dueAt:number, lastReviewedAt?:number,
   *     correct:number, incorrect:number,
   *     status:'new'|'learning'|'review'|'mastered'
   *   }
   * }} Word
   */

  // Deep merge defaults onto loaded state so newly added fields stay populated.
  function mergeDefaults(target, source) {
    if (Array.isArray(source) || Array.isArray(target)) return target ?? source;
    if (typeof source !== 'object' || source === null) return target ?? source;
    if (typeof target !== 'object' || target === null) return JSON.parse(JSON.stringify(source));
    const out = { ...source, ...target };
    for (const k of Object.keys(source)) {
      out[k] = mergeDefaults(target[k], source[k]);
    }
    return out;
  }

  function migrate(loaded) {
    if (!loaded || typeof loaded !== 'object') return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const v = loaded.version || 0;
    // v1 -> v2: introduce settings.uiLang, savedSummaries[], refresh outdated Gemini default
    if (v < 2) {
      loaded.settings = loaded.settings || {};
      if (!loaded.settings.uiLang) loaded.settings.uiLang = 'en';
      if (!Array.isArray(loaded.savedSummaries)) loaded.savedSummaries = [];
      // Best-effort: clear stale gemini-1.5-* default so the AI service picks a current one.
      const g = loaded.settings.providers && loaded.settings.providers.gemini;
      if (g && /^gemini-1\.5-/.test(g.model || '')) g.model = 'gemini-2.0-flash';
      // Drop any legacy settings.sync key that may exist from earlier installs
      if (loaded.settings.sync) delete loaded.settings.sync;
      loaded.version = 2;
    }
    // Backward-compatible word-shape touch-ups (older words may not have pos)
    if (Array.isArray(loaded.vocab)) {
      loaded.vocab.forEach(w => {
        if (w && typeof w === 'object') {
          if (typeof w.pos !== 'string') w.pos = '';
          if (!Array.isArray(w.tags)) w.tags = [];
        }
      });
    }
    return mergeDefaults(loaded, DEFAULT_STATE);
  }

  // ---------- Persistence (debounced) ----------
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      storage.set('state', S);
    }, 60);
  }

  /** Flush pending writes immediately. Used on logout / pagehide so
   *  data isn't lost if the user closes the tab during the 60ms debounce. */
  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try { storage.set('state', S); } catch {}
  }

  function load() {
    const raw = storage.get('state', null);
    return migrate(raw);
  }

  let S = load();

  /* If the synchronous read returned nothing but IndexedDB had a copy,
     storage.get scheduled an async restore. When that restore lands,
     storage emits 'storage:restored' — pick the value back up here so
     a localStorage wipe is recoverable without a manual refresh. */
  bus.on('storage:restored', ({ key }) => {
    if (key !== 'state') return;
    const recovered = storage.get('state', null);
    if (recovered) {
      S = migrate(recovered);
      bus.emit('state:reset');
    }
  });

  /* Make sure pending state writes hit disk before the tab goes away.
     'pagehide' is the only event guaranteed to fire on iOS Safari and
     when the page is moved to the back/forward cache. */
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  // Public API
  const State = {
    get S()  { return S; },
    save:    () => persist(),
    flush:   () => flush(),
    reload() { S = load(); },
    reset()  { S = JSON.parse(JSON.stringify(DEFAULT_STATE)); persist(); flush(); bus.emit('state:reset'); },

    /** Update a slice and persist. Path = dot path into S (e.g., 'settings.accent') */
    set(path, value) {
      const keys = path.split('.');
      let obj = S;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = obj[keys[i]] ?? {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      persist();
      bus.emit('state:change', { path, value });
    },

    update(fn) {
      fn(S);
      persist();
      bus.emit('state:change', { path: '*' });
    },

    /** Export full state as JSON string */
    exportJSON() { return JSON.stringify(S, null, 2); },

    /** Import state JSON. Validates lightly. */
    importJSON(json) {
      let parsed;
      try { parsed = JSON.parse(json); } catch { throw new Error('Invalid JSON.'); }
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid state object.');
      S = migrate(parsed);
      persist();
      flush();
      bus.emit('state:reset');
    }
  };

  global.State = State;
})(window);
