/* =================================================================
   Conjugation view — left-sidebar route #/conjugation.
   - Search any French verb (offline + AI fallback).
   - Shows all major tenses with pronoun-aligned forms.
   - Save the verb to vocabulary as type "verb" so it appears in the
     Conjugation Drill.
   ================================================================= */
(function (global) {
  'use strict';
  const { el, escapeHtml, icons, toast } = global.U;

  let lastResult = null;
  let lastQuery = '';

  const ConjView = {
    renderView(container) {
      container.innerHTML = '';
      const wrap = el('section', { class: 'view' });

      const header = el('div', { class:'view-header' });
      header.appendChild(el('div', { class:'flex-1' },
        el('h1', {}, t('conj.title')),
        el('p', { class:'subtitle muted' }, t('conj.subtitle'))
      ));
      wrap.appendChild(header);

      const card = el('div', { class:'card' });
      const form = el('form', { class:'row gap-8 flex-wrap', style:{ alignItems:'flex-end' } });
      form.addEventListener('submit', (e) => { e.preventDefault(); doSearch(input.value); });
      const inputWrap = el('div', { class:'col flex-1', style:{ minWidth:'220px' } });
      inputWrap.appendChild(el('span', { class:'field-label' }, t('conj.search')));
      const input = el('input', {
        type:'text',
        class:'accent-aware',
        placeholder: t('conj.searchPlaceholder'),
        value: lastQuery,
        autocomplete:'off',
        autocapitalize:'off',
        spellcheck:'false'
      });
      inputWrap.appendChild(input);
      form.appendChild(inputWrap);
      const submit = el('button', { class:'btn btn-primary', type:'submit' });
      submit.innerHTML = icons.search + '<span>' + escapeHtml(t('conj.search')) + '</span>';
      form.appendChild(submit);
      card.appendChild(form);

      if (!global.AI || !global.AI.isReady()) {
        card.appendChild(el('p', { class:'text-sm muted mt-12' }, t('conj.aiHint')));
      }
      wrap.appendChild(card);

      const results = el('div', { class:'col gap-12 mt-16', id:'conj-results' });
      wrap.appendChild(results);

      container.appendChild(wrap);
      setTimeout(() => input.focus(), 60);
      if (lastResult) renderResult(results, lastResult);

      async function doSearch(q) {
        const verb = (q || '').trim().toLowerCase();
        if (!verb) return;
        lastQuery = verb;
        results.innerHTML = '';
        const loading = el('div', { class:'card card-pad-sm row gap-8', style:{ alignItems:'center' } },
          el('span', { class:'spinner' }), el('span', {}, t('common.loading')));
        results.appendChild(loading);
        try {
          const r = await global.Conjugation.lookup(verb);
          loading.remove();
          if (!r || !r.tenses) {
            results.appendChild(notFoundCard());
            return;
          }
          lastResult = r;
          renderResult(results, r);
        } catch (err) {
          loading.remove();
          results.appendChild(el('div', { class:'card card-pad-sm', style:{ borderColor:'var(--danger)' } },
            el('div', {}, '⚠️ ' + (err.message || 'Lookup failed.'))
          ));
        }
      }
    }
  };

  function notFoundCard() {
    const c = el('div', { class:'empty-state' });
    c.innerHTML = `<div class="icon-wrap">${icons.search}</div>
      <h3>${escapeHtml(t('conj.notFound'))}</h3>
      <p>${escapeHtml(t('conj.notFoundHint'))}</p>`;
    return c;
  }

  function renderResult(host, r) {
    host.innerHTML = '';
    const head = el('div', { class:'card row-between', style:{ flexWrap:'wrap', gap:'12px' } });
    const left = el('div', { class:'col' });
    left.appendChild(el('div', { class:'eyebrow' },
      sourceLabel(r.source) + (r.auxiliary ? ' · aux. ' + r.auxiliary : '')));
    left.appendChild(el('div', { class:'flashcard-word', style:{ fontSize:'2rem' } }, r.verb));
    if (r.pastPart) left.appendChild(el('div', { class:'muted text-sm' }, 'Participe passé : ' + r.pastPart));
    head.appendChild(left);

    const actions = el('div', { class:'row gap-8 flex-wrap' });
    const speakBtn = el('button', { class:'btn btn-ghost' });
    speakBtn.innerHTML = icons.speaker + '<span>Pronounce</span>';
    speakBtn.addEventListener('click', () => global.U.speak(r.verb, 'fr-FR'));
    actions.appendChild(speakBtn);

    const inVocab = !!global.Vocab.findBySource(r.verb);
    const saveBtn = el('button', { class:'btn btn-primary' });
    saveBtn.disabled = inVocab;
    saveBtn.innerHTML = icons.plus + '<span>' +
      escapeHtml(inVocab ? t('conj.alreadyInVocab') : t('conj.saveToVocab')) + '</span>';
    saveBtn.addEventListener('click', () => {
      if (saveBtn.disabled) return;
      const summary = global.Conjugation.shortSummary(r);
      global.Vocab.upsertBySource({
        source: r.verb,
        target: '',
        pos: 'verb',
        conjugation: summary,
        sourceType: 'manual',
        tags: ['verb']
      });
      saveBtn.disabled = true;
      saveBtn.innerHTML = icons.check + '<span>' + escapeHtml(t('conj.savedToVocab')) + '</span>';
      toast(t('conj.savedToVocab'), 'success');
    });
    actions.appendChild(saveBtn);
    head.appendChild(actions);
    host.appendChild(head);

    const tenseList = global.Conjugation.tensesList();
    const grid = el('div', { class:'conj-grid' });
    tenseList.forEach(([key, labelKey]) => {
      const forms = r.tenses[key];
      if (!Array.isArray(forms) || forms.length === 0) return;
      const tCard = el('div', { class:'card conj-card' });
      tCard.appendChild(el('div', { class:'eyebrow' }, t(labelKey)));
      const list = el('ul', { class:'conj-list' });
      forms.forEach(f => list.appendChild(el('li', {}, f)));
      tCard.appendChild(list);
      grid.appendChild(tCard);
    });
    host.appendChild(grid);
  }

  function sourceLabel(source) {
    return source === 'ai' ? t('conj.source.ai') : t('conj.source.offline');
  }

  global.ConjView = ConjView;
})(window);
