/* =================================================================
   Accents — French accented-letter popup.
   - Auto-mounts on focusin for any input/textarea with the
     .accent-aware class (or data-accents="true").
   - The popup never grabs focus (uses mousedown.preventDefault),
     so the user can keep typing.
   - Closes with Esc or by clicking ×, or auto-hides shortly after blur.
   ================================================================= */
(function (global) {
  'use strict';
  const { el } = global.U;

  const LETTERS = [
    'à','â','ä','ç','é','è','ê','ë',
    'î','ï','ô','ö','ù','û','ü','œ','æ',
    'À','Â','Ç','É','È','Ê','Ë',
    'Î','Ï','Ô','Ù','Û','Ü','Œ','Æ'
  ];

  function insertAtCursor(input, str) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    const before = input.value.slice(0, start);
    const after  = input.value.slice(end);
    input.value = before + str + after;
    const caret = start + str.length;
    try { input.setSelectionRange(caret, caret); } catch {}
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function buildBar(target) {
    const bar = el('div', { class: 'accent-bar' });
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', global.t ? global.t('accent.toolbar') : 'Accented letters');

    LETTERS.forEach(ch => {
      const b = el('button', {
        type: 'button',
        class: 'accent-chip',
        tabindex: '-1',
        'aria-label': `Insert ${ch}`
      }, ch);
      b.addEventListener('mousedown', (e) => { e.preventDefault(); });
      b.addEventListener('click', (e) => {
        e.preventDefault();
        insertAtCursor(target, ch);
        target.focus();
      });
      bar.appendChild(b);
    });

    const close = el('button', {
      type: 'button',
      class: 'accent-close',
      tabindex: '-1',
      'aria-label': 'Close accents'
    }, '×');
    close.addEventListener('mousedown', (e) => e.preventDefault());
    close.addEventListener('click', () => { bar.remove(); target._accentBar = null; });
    bar.appendChild(close);
    return bar;
  }

  function show(target) {
    if (!target || target._accentBar) return;
    const host = target.parentElement;
    if (!host) return;
    const bar = buildBar(target);
    target._accentBar = bar;
    host.insertBefore(bar, target);

    target.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onEsc);

    function onBlur() {
      setTimeout(() => {
        if (!bar.contains(document.activeElement)) {
          bar.remove();
          target._accentBar = null;
          target.removeEventListener('blur', onBlur);
          document.removeEventListener('keydown', onEsc);
        }
      }, 200);
    }
    function onEsc(e) {
      if (e.key === 'Escape' && target._accentBar) {
        bar.remove();
        target._accentBar = null;
        target.removeEventListener('blur', onBlur);
        document.removeEventListener('keydown', onEsc);
      }
    }
  }

  const Accents = {
    LETTERS,

    attach(field) {
      if (!field || field._accentAttached) return;
      field._accentAttached = true;
      field.classList.add('accent-aware');
      field.addEventListener('focus', () => show(field));
    },

    attachInside(root) {
      if (!root) return;
      const sel = 'input.accent-aware, textarea.accent-aware,' +
                  'input[data-accents="true"], textarea[data-accents="true"]';
      root.querySelectorAll(sel).forEach(f => this.attach(f));
    },

    insert(ch) {
      const f = document.activeElement;
      if (!f || (f.tagName !== 'INPUT' && f.tagName !== 'TEXTAREA')) return;
      insertAtCursor(f, ch);
    }
  };

  // Global focusin hook so newly-rendered .accent-aware fields auto-mount.
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') return;
    if (t.matches?.('.accent-aware, [data-accents="true"]')) {
      if (!t._accentAttached) Accents.attach(t);
      else show(t);
    }
  });

  global.Accents = Accents;
})(window);
