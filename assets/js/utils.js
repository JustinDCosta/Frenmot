/* =================================================================
   Utils — DOM helpers, formatting, escaping, ids, debounce, toast,
   modal, icons. Loaded first; everything else depends on this.
   ================================================================= */
(function (global) {
  'use strict';

  // ---------- DOM ----------
  const $  = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') node.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        node.innerHTML = v;
      } else if (v === true) {
        node.setAttribute(k, '');
      } else {
        node.setAttribute(k, String(v));
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- IDs ----------
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ---------- Time ----------
  const DAY = 86400000;
  function now() { return Date.now(); }
  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  }
  function formatRelative(ts) {
    if (!ts) return '—';
    const diff = ts - Date.now();
    const abs  = Math.abs(diff);
    const days = Math.round(abs / DAY);
    const hrs  = Math.round(abs / 3600000);
    const mins = Math.round(abs / 60000);
    const sign = diff > 0 ? 'in ' : '';
    const ago  = diff < 0 ? ' ago' : '';
    if (abs < 60000) return diff > 0 ? 'in moments' : 'just now';
    if (abs < 3600000) return `${sign}${mins}m${ago}`;
    if (abs < DAY)     return `${sign}${hrs}h${ago}`;
    if (days === 0)    return 'today';
    if (days === 1)    return diff > 0 ? 'tomorrow' : 'yesterday';
    return `${sign}${days}d${ago}`;
  }
  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatInterval(days) {
    if (days < 1)  return 'today';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.round(days/30)} mo`;
    return `${(days/365).toFixed(1)} yr`;
  }

  // ---------- Misc ----------
  function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pickRandom(arr, n) { return shuffle(arr).slice(0, n); }

  function maskKey(k) {
    if (!k) return '';
    if (k.length <= 8) return '••••' + k.slice(-2);
    return k.slice(0, 4) + '•'.repeat(Math.max(4, k.length - 8)) + k.slice(-4);
  }

  // ---------- Icons (centralized) ----------
  const icons = {
    plus:    '<svg viewBox="0 0 24 24" class="icon"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check:   '<svg viewBox="0 0 24 24" class="icon"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close:   '<svg viewBox="0 0 24 24" class="icon"><path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    edit:    '<svg viewBox="0 0 24 24" class="icon"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 113 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trash:   '<svg viewBox="0 0 24 24" class="icon"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" class="icon"><path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    book:    '<svg viewBox="0 0 24 24" class="icon"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chat:    '<svg viewBox="0 0 24 24" class="icon"><path d="M21 12a8 8 0 11-3.5-6.6L21 4l-1.4 3.5A8 8 0 0121 12z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    file:    '<svg viewBox="0 0 24 24" class="icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload:  '<svg viewBox="0 0 24 24" class="icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    download:'<svg viewBox="0 0 24 24" class="icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flame:   '<svg viewBox="0 0 24 24" class="icon"><path d="M12 2s4 4 4 9a4 4 0 11-8 0c0-1.5.5-2.5 1-3-1 1-2 3-2 5a5 5 0 1010 0c0-5-5-11-5-11z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star:    '<svg viewBox="0 0 24 24" class="icon"><path d="M12 2l3.1 6.3 7 1-5 4.9 1.2 6.9L12 18l-6.3 3.1 1.2-6.9-5-4.9 7-1L12 2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    target:  '<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="6"  stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="2"  stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    play:    '<svg viewBox="0 0 24 24" class="icon"><path d="M5 3l14 9-14 9V3z" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round"/></svg>',
    bell:    '<svg viewBox="0 0 24 24" class="icon"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mic:     '<svg viewBox="0 0 24 24" class="icon"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" class="icon"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock:    '<svg viewBox="0 0 24 24" class="icon"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    info:    '<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" class="icon"><path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye:     '<svg viewBox="0 0 24 24" class="icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    eyeOff:  '<svg viewBox="0 0 24 24" class="icon"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a19.5 19.5 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a19.5 19.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    filter:  '<svg viewBox="0 0 24 24" class="icon"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search:  '<svg viewBox="0 0 24 24" class="icon"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    arrow:   '<svg viewBox="0 0 24 24" class="icon"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    settings:'<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tag:     '<svg viewBox="0 0 24 24" class="icon"><path d="M20.6 13.4l-8.2 8.2a2 2 0 01-2.8 0l-7.4-7.4a2 2 0 01-.6-1.4V3h9.8a2 2 0 011.4.6l7.4 7.4a2 2 0 01.4 2.4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>',
    bot:     '<svg viewBox="0 0 24 24" class="icon"><rect x="3" y="8" width="18" height="12" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="9" cy="14" r="1.4" fill="currentColor"/><circle cx="15" cy="14" r="1.4" fill="currentColor"/><path d="M12 4v4M9 4h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send:    '<svg viewBox="0 0 24 24" class="icon"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wand:    '<svg viewBox="0 0 24 24" class="icon"><path d="M3 21l7-7M14 3l7 7-2 2-7-7 2-2zM5 5l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list:    '<svg viewBox="0 0 24 24" class="icon"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    grid:    '<svg viewBox="0 0 24 24" class="icon"><rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="2" fill="none"/><rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="2" fill="none"/><rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="2" fill="none"/><rect x="14" y="14" width="7" height="7" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
  };

  // ---------- Toast ----------
  function toast(message, type = 'info', duration = 3200) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const iconMap = {
      success: '✓', error: '✕', warning: '!', info: 'i'
    };
    const node = el('div', { class: `toast ${type}` },
      el('span', { class: 'icon-circle' }, iconMap[type] || 'i'),
      el('span', { class: 'flex-1' }, message)
    );
    root.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateX(20px)';
      node.style.transition = 'opacity .25s, transform .25s';
      setTimeout(() => node.remove(), 250);
    }, duration);
  }

  // ---------- Modal ----------
  function modal({ title, body, footer, size = 'md', onClose } = {}) {
    const root = document.getElementById('modal-root');
    if (!root) return;
    const overlay = el('div', { class: 'modal-overlay' });
    const m = el('div', {
      class: `modal ${size === 'lg' ? 'modal-lg' : ''}`,
      onclick: (e) => e.stopPropagation()
    });

    const header = el('div', { class: 'modal-header' });
    if (title) header.appendChild(el('h2', {}, title));
    const closeBtn = el('button', {
      class: 'modal-close',
      'aria-label': 'Close',
      html: icons.close
    });
    header.appendChild(closeBtn);

    const bodyEl = el('div', { class: 'modal-body' });
    if (body instanceof Node) bodyEl.appendChild(body);
    else if (typeof body === 'string') bodyEl.innerHTML = body;

    m.appendChild(header);
    m.appendChild(bodyEl);

    if (footer) {
      const f = el('div', { class: 'modal-footer' });
      if (footer instanceof Node) f.appendChild(footer);
      else if (Array.isArray(footer)) footer.forEach(n => f.appendChild(n));
      m.appendChild(f);
    }

    overlay.appendChild(m);
    root.appendChild(overlay);

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .15s';
      setTimeout(() => {
        overlay.remove();
        if (onClose) onClose();
      }, 150);
    }
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    return { close, body: bodyEl, overlay };
  }

  // Confirm helper
  function confirmModal({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const cancel = el('button', { class: 'btn btn-ghost' }, cancelLabel);
      const ok     = el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, confirmLabel);
      const { close } = modal({
        title,
        body: el('p', { class: 'text-muted' }, message),
        footer: [cancel, ok],
        onClose: () => resolve(false)
      });
      cancel.addEventListener('click', () => { close(); resolve(false); });
      ok.addEventListener('click',     () => { close(); resolve(true); });
    });
  }

  // ---------- Markdown-light (safe basic formatting for chat) ----------
  function renderMarkdownLite(text) {
    if (!text) return '';
    let s = escapeHtml(text);
    // code blocks ```...```
    s = s.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
    // inline code `...`
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // bold **...**
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // italic *...*
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    // newlines preserved via white-space: pre-wrap on the bubble
    return s;
  }

  // ---------- Storage ----------
  /*
    Two-layer durable storage:
      1. localStorage (synchronous, fast, primary read path)
      2. IndexedDB    (async mirror, larger quota, survives more aggressive
                       browser cleanups — e.g. "Clear cookies and site data"
                       leaves IndexedDB untouched in some browsers)

    On every write we:
      • Update localStorage synchronously (so reads are immediate).
      • Schedule an async mirror to IndexedDB.

    On the very first read of a key, if localStorage is empty but
    IndexedDB has a copy, we restore the value back to localStorage so
    the rest of the app sees it. This is what makes user data resilient
    against accidental browser-cache clears: as long as IndexedDB
    survives, the data does.

    We also request "persistent storage" once via the StorageManager API
    when available — this asks the browser not to evict our data under
    storage pressure. Granted automatically in many browsers, prompts
    in others, harmless if denied.
  */
  const STORAGE_PREFIX = 'frenmot:';
  const IDB_NAME       = 'frenmot-db';
  const IDB_STORE      = 'kv';
  const IDB_VERSION    = 1;
  let idbReady = null;          // resolves to a db handle (or null on failure)
  const restoredKeys = new Set(); // tracks keys we've already attempted to restore from IDB

  function openDB() {
    if (idbReady) return idbReady;
    idbReady = new Promise((resolve) => {
      try {
        if (!('indexedDB' in window)) { resolve(null); return; }
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          try { req.result.createObjectStore(IDB_STORE); } catch {}
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => { console.warn('[storage] IndexedDB open failed:', req.error); resolve(null); };
        req.onblocked = () => resolve(null);
      } catch (e) { console.warn('[storage] IndexedDB unavailable:', e); resolve(null); }
    });
    return idbReady;
  }

  function idbGet(key) {
    return openDB().then(db => {
      if (!db) return null;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).get(STORAGE_PREFIX + key);
          req.onsuccess = () => resolve(req.result == null ? null : req.result);
          req.onerror   = () => resolve(null);
        } catch { resolve(null); }
      });
    });
  }

  function idbSet(key, value) {
    return openDB().then(db => {
      if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(value, STORAGE_PREFIX + key);
          tx.oncomplete = () => resolve(true);
          tx.onerror    = () => resolve(false);
          tx.onabort    = () => resolve(false);
        } catch { resolve(false); }
      });
    });
  }

  function idbDelete(key) {
    return openDB().then(db => {
      if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).delete(STORAGE_PREFIX + key);
          tx.oncomplete = () => resolve(true);
          tx.onerror    = () => resolve(false);
        } catch { resolve(false); }
      });
    });
  }

  // Ask the browser to keep our data through storage pressure.
  // Best-effort, runs once on first import.
  (function requestPersistent() {
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        // Don't await — fire and forget so it never blocks boot.
        navigator.storage.persisted().then(already => {
          if (!already) navigator.storage.persist().catch(() => {});
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  })();

  const storage = {
    /** Synchronous read from localStorage. If localStorage is empty for
     *  this key and IndexedDB has a backup, we trigger an async restore
     *  the first time we see the key. The current synchronous call
     *  still returns the fallback, but a subsequent read (or the next
     *  page load) will see the restored data.
     *
     *  For the app's state-load path this is fine: state.js calls
     *  storage.get('state') once at boot, and on the very first boot
     *  after a localStorage wipe we want callers to receive whatever
     *  IndexedDB has so reload() can see it on next read.
     */
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (raw != null) return JSON.parse(raw);
      } catch (e) { /* fall through to IDB recovery */ }

      // Try a synchronous fallback path: kick off IDB restore but also
      // attempt to read it from the last successful in-memory cache.
      if (!restoredKeys.has(key)) {
        restoredKeys.add(key);
        idbGet(key).then(value => {
          if (value == null) return;
          try {
            // Only mirror back to localStorage if it's still missing.
            // Don't trample a value that arrived between the two reads.
            const cur = localStorage.getItem(STORAGE_PREFIX + key);
            if (cur == null) {
              localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
              bus.emit('storage:restored', { key });
            }
          } catch { /* localStorage might be disabled — that's ok, IDB is still authoritative */ }
        }).catch(() => {});
      }
      return fallback;
    },

    /** Async-aware get used by code that wants to wait for IDB recovery. */
    async getAsync(key, fallback = null) {
      const sync = this.get(key, undefined);
      if (sync !== undefined) return sync;
      const fromIdb = await idbGet(key);
      return fromIdb == null ? fallback : fromIdb;
    },

    set(key, value) {
      try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); }
      catch (e) {
        // localStorage may be full (5-10 MB cap) or blocked (private mode).
        // The IDB mirror below has a much larger quota, so the data is
        // still durable.
        console.warn('[storage] localStorage write failed:', e?.message);
      }
      // Mirror to IDB. Fire-and-forget so callers don't have to await.
      idbSet(key, value).catch(() => {});
    },

    remove(key) {
      try { localStorage.removeItem(STORAGE_PREFIX + key); } catch {}
      idbDelete(key).catch(() => {});
    },

    clearAll() {
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
        });
      } catch {}
      // Wipe the IDB mirror too so a "Reset all data" doesn't leave a
      // ghost copy that gets restored on next boot.
      openDB().then(db => {
        if (!db) return;
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).clear();
        } catch {}
      });
    }
  };

  // Light XOR + base64 obfuscation (NOT real encryption — just to keep
  // raw API keys out of devtools "Application" tab as plain text).
  // The user is informed this is best-effort client-side.
  function obfuscate(plain, secret = 'frenmot-key-v1') {
    if (plain == null) return '';
    const bytes = new TextEncoder().encode(plain);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ secret.charCodeAt(i % secret.length);
    }
    return btoa(String.fromCharCode(...out));
  }
  function deobfuscate(b64, secret = 'frenmot-key-v1') {
    if (!b64) return '';
    try {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ secret.charCodeAt(i % secret.length);
      }
      return new TextDecoder().decode(out);
    } catch { return ''; }
  }

  // ---------- Speech (TTS) ----------
  function speak(text, lang = 'fr-FR') {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // ---------- Event bus ----------
  const bus = (() => {
    const map = new Map();
    return {
      on(name, fn)  { (map.get(name) || map.set(name, new Set()).get(name)).add(fn); return () => bus.off(name, fn); },
      off(name, fn) { map.get(name)?.delete(fn); },
      emit(name, payload) { map.get(name)?.forEach(fn => { try { fn(payload); } catch(e) { console.error(e); } }); }
    };
  })();

  // ---------- Export ----------
  global.U = {
    $, $$, el, escapeHtml,
    uuid, debounce, clamp, shuffle, pickRandom, maskKey,
    icons, toast, modal, confirmModal, renderMarkdownLite,
    storage, obfuscate, deobfuscate,
    now, todayKey, startOfDay, daysBetween,
    formatRelative, formatDate, formatInterval,
    speak, bus,
    DAY
  };
})(window);
