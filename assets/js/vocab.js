/* =================================================================
   Vocabulary — CRUD, render list, modals for add/edit, filters,
   import/export. Uses State as the source of truth.
   ================================================================= */
(function (global) {
  'use strict';
  const { $, $$, el, escapeHtml, uuid, icons, toast, modal, confirmModal, debounce, formatRelative, formatDate, speak } = global.U;
  const { S } = global.State;

  // Local UI state for the vocab view
  const ui = {
    query: '',
    sort: 'recent',           // recent | alpha | difficulty | due
    statusFilter: 'all',      // all | new | learning | review | mastered | due
    tagFilter: null,
    layout: 'grid'            // grid | list
  };

  function langLabel(code) {
    return ({ fr:'French', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese',
              ja:'Japanese', ko:'Korean', zh:'Chinese', en:'English' })[code] || code;
  }
  function ttsLang(code) {
    return ({ fr:'fr-FR', es:'es-ES', de:'de-DE', it:'it-IT', pt:'pt-PT',
              ja:'ja-JP', ko:'ko-KR', zh:'zh-CN', en:'en-US' })[code] || 'en-US';
  }

  function newWord(partial = {}) {
    return {
      id: uuid(),
      source: '',
      target: '',
      definition: '',
      example: '',
      examples: [],
      pos: '',
      gender: '',
      conjugation: '',
      notes: '',
      tags: [],
      difficulty: 2,
      sourceType: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      srs: global.SRS.makeInitial(),
      ...partial
    };
  }

  // ---------- CRUD ----------
  const Vocab = {
    all() { return global.State.S.vocab; },

    findBySource(text) {
      const q = (text || '').trim().toLowerCase();
      if (!q) return null;
      return global.State.S.vocab.find(w => (w.source || '').toLowerCase() === q) || null;
    },

    add(partial = {}) {
      const word = newWord(partial);
      global.State.update(s => { s.vocab.unshift(word); });
      // bump weekly history "added" count
      global.State.update(s => {
        const today = global.U.todayKey();
        const wh = s.stats.weekHistory;
        let entry = wh.find(e => e.day === today);
        if (!entry) { entry = { day: today, reviewed: 0, correct: 0, added: 0 }; wh.push(entry); }
        entry.added += 1;
      });
      global.U.bus.emit('vocab:change');
      return word;
    },

    update(id, patch) {
      global.State.update(s => {
        const i = s.vocab.findIndex(w => w.id === id);
        if (i >= 0) s.vocab[i] = { ...s.vocab[i], ...patch, updatedAt: Date.now() };
      });
      global.U.bus.emit('vocab:change');
    },

    remove(id) {
      global.State.update(s => { s.vocab = s.vocab.filter(w => w.id !== id); });
      global.U.bus.emit('vocab:change');
    },

    upsertBySource(partial) {
      if (!partial.source) return null;
      const found = this.findBySource(partial.source);
      if (found) { this.update(found.id, partial); return found.id; }
      return this.add(partial).id;
    },

    /** Apply filters/search to a list */
    filter(list) {
      let out = list;
      const q = ui.query.trim().toLowerCase();
      if (q) {
        out = out.filter(w =>
          (w.source || '').toLowerCase().includes(q) ||
          (w.target || '').toLowerCase().includes(q) ||
          (w.definition || '').toLowerCase().includes(q) ||
          (w.tags || []).some(t => (t || '').toLowerCase().includes(q))
        );
      }
      if (ui.statusFilter !== 'all') {
        if (ui.statusFilter === 'due') {
          const t = Date.now();
          out = out.filter(w => (w.srs?.dueAt ?? 0) <= t);
        } else {
          out = out.filter(w => (w.srs?.status || 'new') === ui.statusFilter);
        }
      }
      if (ui.tagFilter) {
        out = out.filter(w => (w.tags || []).includes(ui.tagFilter));
      }
      if (ui.sort === 'alpha') {
        out = out.slice().sort((a, b) => (a.source || '').localeCompare(b.source || ''));
      } else if (ui.sort === 'difficulty') {
        out = out.slice().sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0));
      } else if (ui.sort === 'due') {
        out = out.slice().sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0));
      } else {
        out = out.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
      return out;
    },

    allTags() {
      const set = new Set();
      this.all().forEach(w => (w.tags || []).forEach(t => t && set.add(t)));
      return Array.from(set).sort();
    },

    importMany(rows) {
      const addedIds = [];
      global.State.update(s => {
        rows.forEach(r => {
          if (!r.source) return;
          const exists = s.vocab.find(w => (w.source || '').toLowerCase() === (r.source || '').toLowerCase());
          if (exists) return;
          const w = newWord({ ...r, sourceType: r.sourceType || 'preloaded' });
          s.vocab.unshift(w);
          addedIds.push(w.id);
        });
      });
      global.U.bus.emit('vocab:change');
      return addedIds;
    }
  };
  global.Vocab = Vocab;
})(window);


/* ===== Vocab UI: rendering, toolbar, modals ===== */
(function (global) {
  'use strict';
  const { $, $$, el, escapeHtml, icons, toast, modal, confirmModal, debounce, formatRelative, speak } = global.U;
  const Vocab = global.Vocab;

  // private UI state
  const view = {
    query: '',
    sort: 'recent',
    statusFilter: 'all',
    tagFilter: null,
    layout: 'grid'
  };

  function renderVocabularyView(container) {
    container.innerHTML = '';
    const wrap = el('section', { class: 'view' });

    // Header
    const header = el('div', { class: 'view-header' });
    header.appendChild(el('div', { class: 'flex-1' },
      el('h1', {}, 'Vocabulary'),
      el('p', { class: 'subtitle muted' }, 'Build, organize, and master your personal word collection.')
    ));
    const actions = el('div', { class: 'actions' });
    actions.appendChild(buildBtn('btn btn-outline', icons.upload, 'Import', () => openImportModal()));
    actions.appendChild(buildBtn('btn btn-outline', icons.download, 'Export', () => exportJSON()));
    actions.appendChild(buildBtn('btn btn-primary', icons.plus, 'Add word', () => openWordModal()));
    header.appendChild(actions);
    wrap.appendChild(header);

    // Toolbar
    const toolbar = el('div', { class: 'vocab-toolbar' });
    const searchWrap = el('div', { class: 'search-wrap' });
    searchWrap.innerHTML = icons.search;
    const searchInput = el('input', {
      type: 'search',
      placeholder: 'Search word, translation, definition or tag…',
      value: view.query
    });
    searchInput.addEventListener('input', debounce(() => {
      view.query = searchInput.value;
      renderList();
    }, 150));
    searchWrap.appendChild(searchInput);
    toolbar.appendChild(searchWrap);

    // Status filter
    const statusSelect = el('select', { class: 'select', style: { maxWidth: '180px' } });
    [
      ['all','All statuses'], ['due','Due now'], ['new','New'],
      ['learning','Learning'], ['review','Reviewing'], ['mastered','Mastered']
    ].forEach(([v,l]) => {
      const o = el('option', { value: v }, l);
      if (view.statusFilter === v) o.selected = true;
      statusSelect.appendChild(o);
    });
    statusSelect.addEventListener('change', () => { view.statusFilter = statusSelect.value; renderList(); });
    toolbar.appendChild(statusSelect);

    // Sort
    const sortSelect = el('select', { class: 'select', style: { maxWidth: '160px' } });
    [['recent','Recently updated'],['alpha','Alphabetical'],['difficulty','Difficulty'],['due','Due date']]
      .forEach(([v,l]) => {
        const o = el('option', { value: v }, l);
        if (view.sort === v) o.selected = true;
        sortSelect.appendChild(o);
      });
    sortSelect.addEventListener('change', () => { view.sort = sortSelect.value; renderList(); });
    toolbar.appendChild(sortSelect);

    wrap.appendChild(toolbar);

    // Tag chips
    const tags = Vocab.allTags();
    if (tags.length) {
      const chips = el('div', { class: 'row flex-wrap mb-16', style: { gap: '6px' } });
      const allChip = el('button', {
        class: 'tag', style: { cursor: 'pointer', padding: '4px 10px' },
        onclick: () => { view.tagFilter = null; renderList(); }
      }, 'All tags');
      if (!view.tagFilter) allChip.style.outline = '2px solid var(--accent-500)';
      chips.appendChild(allChip);
      tags.forEach(t => {
        const c = el('button', {
          class: 'tag', style: { cursor: 'pointer', padding: '4px 10px' },
          onclick: () => { view.tagFilter = (view.tagFilter === t ? null : t); renderList(); }
        }, '#' + t);
        if (view.tagFilter === t) c.style.outline = '2px solid var(--accent-500)';
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
    }

    const listEl = el('div', { class: 'vocab-grid', id: 'vocab-list' });
    wrap.appendChild(listEl);

    container.appendChild(wrap);
    renderList();

    function renderList() {
      const list = Vocab.filter(Vocab.all());
      listEl.innerHTML = '';
      if (!list.length) {
        listEl.replaceWith(emptyState());
        return;
      }
      list.forEach(w => listEl.appendChild(renderCard(w)));
    }

    function emptyState() {
      const wrap = el('div', { class: 'empty-state', id: 'vocab-list' });
      wrap.innerHTML = `
        <div class="icon-wrap">${icons.book}</div>
        <h3>${Vocab.all().length === 0 ? 'No words yet' : 'No matches'}</h3>
        <p>${Vocab.all().length === 0 ?
            'Start by adding your first vocabulary word, importing a list, or asking the AI tutor.' :
            'Try a different search or clear your filters.'}</p>`;
      const row = el('div', { class: 'row', style: { justifyContent:'center' } });
      row.appendChild(buildBtn('btn btn-primary', icons.plus, 'Add word', () => openWordModal()));
      row.appendChild(buildBtn('btn btn-outline', icons.upload, 'Import', () => openImportModal()));
      wrap.appendChild(row);
      return wrap;
    }
  }

  function renderCard(w) {
    const card = el('div', { class: 'vocab-card', onclick: () => openWordModal(w) });
    const head = el('div', { class: 'vocab-head' });
    head.appendChild(el('div', { class: 'flex-1' },
      el('div', { class: 'vocab-word' }, w.source || '—'),
      el('div', { class: 'vocab-translation' }, w.target || '')
    ));
    const speakBtn = el('button', {
      class: 'icon-btn', title: 'Pronounce',
      onclick: (e) => { e.stopPropagation(); speak(w.source, ttsLangFor(w)); },
      html: icons.speaker, style: { width: '32px', height: '32px' }
    });
    head.appendChild(speakBtn);
    card.appendChild(head);

    if (w.definition) {
      card.appendChild(el('div', { class: 'definition' }, w.definition));
    }

    const meta = el('div', { class: 'meta' });
    if (w.pos) meta.appendChild(el('span', { class: 'badge' }, w.pos));
    if (w.gender) meta.appendChild(el('span', { class: 'badge badge-info' }, w.gender));
    if (w.sourceType && w.sourceType !== 'manual') {
      meta.appendChild(el('span', { class: 'badge badge-accent' }, w.sourceType));
    }
    const status = w.srs?.status || 'new';
    meta.appendChild(el('span', { class: `badge ${badgeColor(status)}` }, status));
    if (w.srs?.dueAt) {
      meta.appendChild(el('span', { class: 'badge' }, 'due ' + formatRelative(w.srs.dueAt)));
    }
    const dots = el('span', { class: 'difficulty-dots', title: 'Difficulty' });
    for (let i = 1; i <= 5; i++) dots.appendChild(el('span', { class: i <= (w.difficulty || 0) ? 'on' : '' }));
    meta.appendChild(dots);
    card.appendChild(meta);

    if (w.tags && w.tags.length) {
      const tags = el('div', { class: 'row flex-wrap', style: { gap: '4px' } });
      w.tags.slice(0, 4).forEach(t => tags.appendChild(el('span', { class: 'tag' }, '#' + t)));
      card.appendChild(tags);
    }
    return card;
  }

  function badgeColor(status) {
    return ({ new:'badge-info', learning:'badge-warning', review:'badge-accent', mastered:'badge-success' })[status] || 'badge';
  }
  function ttsLangFor(w) {
    return ({ fr:'fr-FR', es:'es-ES', de:'de-DE', it:'it-IT', pt:'pt-PT', ja:'ja-JP', ko:'ko-KR', zh:'zh-CN' })[global.State.S.settings.targetLang] || 'en-US';
  }

  function buildBtn(klass, iconHtml, label, onClick) {
    const b = el('button', { class: klass, onclick: onClick });
    b.innerHTML = (iconHtml || '') + (label ? `<span>${escapeHtml(label)}</span>` : '');
    return b;
  }

  // expose
  global.Vocab.renderView = renderVocabularyView;
  global.Vocab.openWordModal = openWordModal;
  global.Vocab.openImportModal = openImportModal;

  /* ----- Word add/edit modal ----- */
  function openWordModal(existing) {
    const w = existing ? { ...existing } : null;
    const form = el('form', { class: 'col gap-12' });

    const row1 = el('div', { class: 'row gap-12', style: { flexWrap:'wrap' } });
    const sourceField = field('Word *', el('input', {
      type:'text', required:true, value: w?.source || '',
      placeholder:'e.g. flâner', name:'source'
    }));
    const targetField = field('Translation', el('input', {
      type:'text', value: w?.target || '',
      placeholder:'e.g. to stroll aimlessly', name:'target'
    }));
    sourceField.style.flex = '1 1 220px';
    targetField.style.flex = '1 1 220px';
    row1.appendChild(sourceField);
    row1.appendChild(targetField);
    form.appendChild(row1);

    const defField = field('Definition / meaning', el('textarea', {
      rows:'2', placeholder:'A short definition…', name:'definition'
    }, w?.definition || ''));
    form.appendChild(defField);

    const exField = field('Example sentence', el('textarea', {
      rows:'2', placeholder:'Use the word in context.', name:'example'
    }, w?.example || ''));
    form.appendChild(exField);

    const row2 = el('div', { class: 'row gap-12', style: { flexWrap:'wrap' } });
    const posField = field('Part of speech', selectFrom('pos', ['','noun','verb','adjective','adverb','phrase','expression','preposition','other'], w?.pos || ''));
    const genderField = field('Gender / form', selectFrom('gender', ['','masculine','feminine','neuter','plural'], w?.gender || ''));
    const diffField = field('Difficulty', el('input', { type:'number', min:'1', max:'5', name:'difficulty', value: String(w?.difficulty || 2) }));
    [posField, genderField, diffField].forEach(f => { f.style.flex = '1 1 140px'; row2.appendChild(f); });
    form.appendChild(row2);

    const conjField = field('Conjugation notes (verbs)', el('textarea', { rows:'2', placeholder:'je vais, tu vas, …', name:'conjugation' }, w?.conjugation || ''));
    form.appendChild(conjField);

    const tagsField = field('Tags (comma separated)', el('input', { type:'text', name:'tags', placeholder:'e.g. travel, B2, idioms', value: (w?.tags || []).join(', ') }));
    form.appendChild(tagsField);

    const notesField = field('Notes', el('textarea', { rows:'2', name:'notes', placeholder:'Anything else worth remembering' }, w?.notes || ''));
    form.appendChild(notesField);

    const aiBtn = el('button', { type:'button', class:'btn btn-secondary' }, 'Enhance with AI');
    aiBtn.innerHTML = global.U.icons.sparkle + '<span>Enhance with AI</span>';
    aiBtn.addEventListener('click', () => enhanceWithAI(form));

    const cancel = el('button', { type:'button', class:'btn btn-ghost' }, 'Cancel');
    const save   = el('button', { type:'submit', class:'btn btn-primary' }, w ? 'Save changes' : 'Add word');
    let removeBtn;
    if (w) {
      removeBtn = el('button', { type:'button', class:'btn btn-ghost', style:{ color:'var(--danger)' } }, 'Delete');
      removeBtn.innerHTML = icons.trash + '<span>Delete</span>';
    }

    const footer = el('div', { class:'row', style:{ width:'100%', justifyContent:'space-between', flexWrap:'wrap', gap:'8px' } });
    const left = el('div', { class:'row gap-8' }, aiBtn);
    if (removeBtn) left.appendChild(removeBtn);
    const right = el('div', { class:'row gap-8' }, cancel, save);
    footer.appendChild(left);
    footer.appendChild(right);

    const { close } = modal({
      title: w ? 'Edit word' : 'Add a new word',
      body: form,
      footer,
      size: 'lg'
    });
    cancel.addEventListener('click', close);
    if (removeBtn) removeBtn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Delete this word?',
        message: `“${w.source}” and its review history will be removed.`,
        confirmLabel: 'Delete', danger: true
      });
      if (ok) { Vocab.remove(w.id); close(); toast('Word deleted', 'success'); }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm(form);
      const tags = (data.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      const patch = {
        source: data.source.trim(),
        target: data.target.trim(),
        definition: data.definition.trim(),
        example: data.example.trim(),
        pos: data.pos,
        gender: data.gender,
        difficulty: Math.max(1, Math.min(5, Number(data.difficulty) || 2)),
        conjugation: data.conjugation.trim(),
        notes: data.notes.trim(),
        tags
      };
      if (!patch.source) { toast('Word is required.', 'error'); return; }
      if (w) Vocab.update(w.id, patch);
      else Vocab.add({ ...patch, sourceType: 'manual' });
      close();
      toast(w ? 'Word updated' : 'Word added', 'success');
    });
  }

  function field(label, input) {
    return el('label', { class:'field' },
      el('span', { class:'field-label' }, label),
      input
    );
  }
  function selectFrom(name, options, value) {
    const sel = el('select', { name });
    options.forEach(opt => {
      const o = el('option', { value: opt }, opt || '—');
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }
  function readForm(form) {
    const out = {};
    Array.from(form.elements).forEach(el => {
      if (!el.name) return;
      out[el.name] = el.value;
    });
    return out;
  }

  async function enhanceWithAI(form) {
    const data = readForm(form);
    const word = (data.source || '').trim();
    if (!word) { toast('Type a word first.', 'warning'); return; }
    if (!global.AI || !global.AI.isReady()) {
      toast('Connect an AI provider in Settings to use this.', 'warning'); return;
    }
    toast('Asking AI…', 'info', 1500);
    try {
      const enhanced = await global.AI.enhanceWord(word, global.State.S.settings.targetLang);
      if (enhanced.target && !data.target) form.elements['target'].value = enhanced.target;
      if (enhanced.definition && !data.definition) form.elements['definition'].value = enhanced.definition;
      if (enhanced.example && !data.example) form.elements['example'].value = enhanced.example;
      if (enhanced.pos && !data.pos) form.elements['pos'].value = enhanced.pos;
      if (enhanced.gender && !data.gender) form.elements['gender'].value = enhanced.gender;
      if (enhanced.conjugation && !data.conjugation) form.elements['conjugation'].value = enhanced.conjugation;
      if (enhanced.difficulty) form.elements['difficulty'].value = enhanced.difficulty;
      toast('AI enhanced ✨', 'success');
    } catch (err) {
      toast(err.message || 'AI request failed', 'error');
    }
  }

  /* ----- Import modal ----- */
  function openImportModal() {
    const wrap = el('div', { class:'col gap-12' });
    wrap.appendChild(el('p', { class:'muted text-sm' },
      'Paste JSON (array of words) or simple lines: "word — translation" or "word | translation | definition".'
    ));
    const ta = el('textarea', { rows:'10', placeholder:`flâner — to stroll aimlessly\ndépayser | to feel out of place\n\nor [{"source":"...","target":"...","definition":"..."}]` });
    wrap.appendChild(ta);

    const cancel = el('button', { class:'btn btn-ghost' }, 'Cancel');
    const ok     = el('button', { class:'btn btn-primary' }, 'Import');
    const { close } = modal({ title: 'Import vocabulary', body: wrap, footer: [cancel, ok] });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) return;
      const rows = parseImport(text);
      if (!rows.length) { toast('Nothing parsed. Check format.', 'error'); return; }
      const ids = Vocab.importMany(rows);
      close();
      toast(`Imported ${ids.length} word${ids.length === 1 ? '' : 's'}`, 'success');
    });
  }

  function parseImport(text) {
    // Try JSON array first
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr.filter(r => r && r.source);
      } catch { /* fall through */ }
    }
    return text.split(/\r?\n/).map(line => {
      line = line.trim();
      if (!line) return null;
      const parts = line.split(/\s*[\|—–-]+\s*/);
      const [source, target, definition] = parts;
      if (!source) return null;
      return { source, target: target || '', definition: definition || '' };
    }).filter(Boolean);
  }

  function exportJSON() {
    const data = JSON.stringify(global.State.S.vocab, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `frenmot-vocab-${new Date().toISOString().slice(0,10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Vocabulary exported', 'success');
  }

})(window);
