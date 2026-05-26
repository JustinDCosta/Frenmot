/* =================================================================
   PDF — upload, parse via pdf.js (CDN), AI Q&A, summarize, extract
   difficult vocabulary, and add directly to user's vocabulary list.
   ================================================================= */
(function (global) {
  'use strict';
  const { el, escapeHtml, icons, toast, modal, confirmModal } = global.U;

  const view = {
    activeId: null,
    chat: [],
    /** Per-doc UI state (hidden, translation, loading, error). */
    summaryUI: Object.create(null),
    askPending: false,
    askError: null
  };

  function getSumUI(docId) {
    if (!view.summaryUI[docId]) {
      view.summaryUI[docId] = { hidden: false, translation: null, translatingTo: null };
    }
    return view.summaryUI[docId];
  }

  /* ---------------- Saved-summaries store ---------------- */
  const Saved = {
    list() { return global.State.S.savedSummaries || []; },

    has(docId, content) {
      return this.list().some(s => s.docId === docId && s.content === content);
    },

    add({ docId, docName, content, lang }) {
      if (!content) return null;
      if (this.has(docId, content)) return null;
      const entry = {
        id: global.U.uuid(),
        docId: docId || null,
        docName: docName || '',
        content: String(content),
        lang: lang || global.State.S.settings.uiLang || 'en',
        savedAt: Date.now()
      };
      global.State.update(s => {
        if (!Array.isArray(s.savedSummaries)) s.savedSummaries = [];
        s.savedSummaries.unshift(entry);
        while (s.savedSummaries.length > 200) s.savedSummaries.pop();
      });
      return entry;
    },

    remove(id) {
      global.State.update(s => {
        if (Array.isArray(s.savedSummaries)) {
          s.savedSummaries = s.savedSummaries.filter(x => x.id !== id);
        }
      });
    }
  };

  const PDF = {
    Saved,

    async parseFile(file) {
      if (!file) throw new Error('No file selected.');
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        throw new Error('That doesn\u2019t look like a PDF.');
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('PDFs above 25 MB aren\u2019t supported here.');
      }
      if (!global.pdfjsLib) throw new Error('PDF engine failed to load. Refresh and try again.');
      const buf = await file.arrayBuffer();
      const pdf = await global.pdfjsLib.getDocument({ data: buf }).promise;
      const pages = pdf.numPages;
      let text = '';
      for (let p = 1; p <= pages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const tt = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
        text += tt + '\n\n';
      }
      return { text: text.trim(), pages, name: file.name, size: file.size };
    },

    save({ name, text, pages }) {
      const doc = {
        id: global.U.uuid(),
        name,
        addedAt: Date.now(),
        text,
        summary: '',
        pages: pages || 0,
        size: text.length
      };
      global.State.update(s => { s.pdfs.unshift(doc); });
      return doc;
    },

    remove(id) {
      global.State.update(s => { s.pdfs = s.pdfs.filter(p => p.id !== id); });
    },

    /* -------- View -------- */
    renderView(container) {
      container.innerHTML = '';
      const wrap = el('section', { class: 'view' });

      const header = el('div', { class: 'view-header' });
      header.appendChild(el('div', { class: 'flex-1' },
        el('h1', {}, t('pdf.title')),
        el('p', { class: 'subtitle muted' }, t('pdf.subtitle'))
      ));
      if (Saved.list().length) {
        const savedBtn = el('button', { class:'btn btn-outline' });
        savedBtn.innerHTML = icons.star + '<span>' + escapeHtml(
          t('pdf.saved.viewAll') + ' (' + Saved.list().length + ')') + '</span>';
        savedBtn.addEventListener('click', () => openSavedModal());
        const actions = el('div', { class:'actions' });
        actions.appendChild(savedBtn);
        header.appendChild(actions);
      }
      wrap.appendChild(header);

      const shell = el('div', { class: 'pdf-shell' });
      const left  = el('div', { class: 'pdf-panel' });
      const right = el('div', { class: 'pdf-panel pdf-panel-right' });
      shell.appendChild(left);
      shell.appendChild(right);
      wrap.appendChild(shell);
      container.appendChild(wrap);

      renderLeft();
      renderRight();

      function renderLeft() {
        left.innerHTML = '';
        const docs = global.State.S.pdfs;

        const top = el('div', { class: 'pdf-toolbar' });
        const meta = el('div', { class: 'pdf-doc-meta' },
          docs.length ? t('pdf.docCount', { n: docs.length }) : t('pdf.noDocs'));
        const newBtn = el('button', { class: 'btn btn-primary' });
        newBtn.innerHTML = icons.upload + '<span>' + escapeHtml(t('pdf.upload')) + '</span>';
        newBtn.addEventListener('click', () => triggerUpload(renderLeft, renderRight));
        top.appendChild(meta);
        top.appendChild(newBtn);
        left.appendChild(top);

        if (!docs.length) {
          left.appendChild(buildDropZone(renderLeft, renderRight));
          return;
        }

        const list = el('div', { class: 'col gap-8 pdf-doc-list' });
        docs.forEach(d => list.appendChild(buildDocItem(d, renderLeft, renderRight)));
        left.appendChild(list);

        if (!view.activeId) view.activeId = docs[0].id;
        const active = docs.find(d => d.id === view.activeId) || docs[0];
        if (active) {
          const preview = el('div', { class: 'pdf-text-view pdf-preview' });
          preview.textContent = active.text.slice(0, 6000) + (active.text.length > 6000 ? '\n\n…(truncated)' : '');
          left.appendChild(preview);
        }
      }

      function buildDocItem(d, refreshL, refreshR) {
        const isActive = d.id === view.activeId;
        const item = el('button', {
          class: 'card card-pad-sm card-hover',
          style: {
            textAlign:'left', width:'100%', cursor:'pointer',
            borderColor: isActive ? 'var(--accent-500)' : ''
          },
          onclick: () => {
            if (view.activeId !== d.id) {
              view.chat = []; view.askPending = false; view.askError = null;
            }
            view.activeId = d.id; refreshL(); refreshR();
          }
        });
        item.appendChild(el('div', { class: 'row', style:{ alignItems:'center' } },
          el('span', { class:'icon-btn', html: icons.file, style:{ width:'32px', height:'32px' } }),
          el('div', { class:'flex-1', style:{ minWidth:0 } },
            el('div', { class:'row-between' },
              el('div', { style:{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, d.name),
              el('div', { class:'text-xs muted' }, `${d.pages} pages`)
            ),
            el('div', { class:'text-xs muted' }, global.U.formatRelative(d.addedAt))
          ),
          el('button', {
            class: 'icon-btn', title: t('common.delete'),
            html: icons.trash, style: { width:'32px', height:'32px' },
            onclick: async (e) => {
              e.stopPropagation();
              const ok = await confirmModal({
                title: t('pdf.removeConfirmTitle'),
                message: t('pdf.removeConfirmBody'),
                danger:true, confirmLabel: t('common.delete')
              });
              if (ok) {
                PDF.remove(d.id);
                if (view.activeId === d.id) view.activeId = null;
                delete view.summaryUI[d.id];
                refreshL(); refreshR();
                toast(t('pdf.removed'), 'success');
              }
            }
          })
        ));
        return item;
      }

      function renderRight() {
        right.innerHTML = '';
        const doc = global.State.S.pdfs.find(p => p.id === view.activeId);

        if (!doc) {
          right.appendChild(el('div', { class: 'empty-state', style:{ margin:'auto' } },
            el('div', { class:'icon-wrap', html: icons.file }),
            el('h3', {}, t('pdf.pickDoc.title')),
            el('p', { class:'muted' }, t('pdf.pickDoc.body'))
          ));
          return;
        }

        const top = el('div', { class: 'pdf-toolbar' });
        top.appendChild(el('div', { class: 'pdf-doc-meta', style:{ fontWeight: 600, fontSize: '14px' } }, doc.name));
        const sumBtn = el('button', { class: 'btn btn-secondary' });
        const hasSummary = !!doc.summary;
        sumBtn.innerHTML = icons.sparkle + '<span>' +
          escapeHtml(hasSummary ? t('pdf.summary.regenerate') : t('pdf.summarize')) + '</span>';
        sumBtn.addEventListener('click', () => actSummarize(doc, sumBtn));

        const xVocab = el('button', { class: 'btn btn-secondary' });
        xVocab.innerHTML = icons.book + '<span>' + escapeHtml(t('pdf.extractVocab')) + '</span>';
        xVocab.addEventListener('click', () => actExtract(doc, xVocab));

        const xQuiz = el('button', { class: 'btn btn-outline' });
        xQuiz.innerHTML = icons.target + '<span>' + escapeHtml(t('pdf.quizMe')) + '</span>';
        xQuiz.addEventListener('click', () => actQuiz(doc));

        top.appendChild(sumBtn);
        top.appendChild(xVocab);
        top.appendChild(xQuiz);
        right.appendChild(top);

        right.appendChild(buildSummaryCard(doc, renderRight));
        right.appendChild(buildQAPanel(doc, renderRight));
      }

      async function actSummarize(doc, btn) {
        if (!global.AI.isReady()) { toast(t('chat.connectFirst'), 'warning'); return; }
        const ui = getSumUI(doc.id);
        ui.hidden = false; ui.loading = true; ui.error = null;
        if (btn) btn.disabled = true;
        renderRight();
        try {
          const summary = await global.AI.summarizeText(doc.text);
          global.State.update(s => {
            const d = s.pdfs.find(p => p.id === doc.id);
            if (d) d.summary = summary;
          });
          ui.translation = null; ui.translatingTo = null; ui.loading = false;
          renderRight();
          toast(t('pdf.summarized'), 'success');
        } catch (e) {
          ui.loading = false;
          ui.error = e.message || 'Summarize failed.';
          renderRight();
          toast(e.message, 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      }

      async function actExtract(doc, btn) {
        if (!global.AI.isReady()) { toast(t('chat.connectFirst'), 'warning'); return; }
        toast(t('pdf.extracting'), 'info', 1500);
        if (btn) btn.disabled = true;
        try {
          const rows = await global.AI.extractDifficultWords(doc.text, global.State.S.settings.targetLang, 12);
          if (!rows.length) { toast('No vocabulary extracted.', 'warning'); return; }
          openExtractModal(rows);
        } catch (e) { toast(e.message, 'error'); }
        finally { if (btn) btn.disabled = false; }
      }

      function actQuiz(doc) {
        global.App.navigateTo('learn', { mode:'quiz', filter:'all' });
      }
    }
  };

  /* ---------- Summary card ---------- */
  function buildSummaryCard(doc, refresh) {
    const ui = getSumUI(doc.id);

    if (ui.hidden && doc.summary) {
      const restore = el('div', { class: 'pdf-summary-hidden' });
      restore.appendChild(el('span', { class:'muted text-sm' }, t('pdf.summary')));
      const showBtn = el('button', { class:'btn btn-ghost btn-sm' });
      showBtn.innerHTML = icons.eye + '<span>' + escapeHtml(t('common.yes')) + '</span>';
      showBtn.addEventListener('click', () => { ui.hidden = false; refresh(); });
      restore.appendChild(showBtn);
      return restore;
    }

    const card = el('section', { class: 'pdf-summary-card', 'aria-label': t('pdf.summary') });

    const head = el('div', { class:'pdf-summary-head' });
    head.appendChild(el('div', { class:'pdf-summary-title' },
      el('div', { class:'eyebrow' }, t('pdf.summary'))
    ));
    const controls = el('div', { class:'pdf-summary-controls' });

    const isTranslated = !!ui.translation;
    const translateBtn = el('button', {
      class: 'btn btn-ghost btn-sm',
      title: t('pdf.summary.translate'),
      'aria-label': t('pdf.summary.translate'),
      disabled: !doc.summary && !ui.loading ? true : false
    });
    translateBtn.innerHTML = (isTranslated
      ? icons.refresh + '<span>' + escapeHtml(t('pdf.summary.original')) + '</span>'
      : icons.wand    + '<span>' + escapeHtml(t('pdf.summary.translate')) + '</span>'
    );
    translateBtn.addEventListener('click', () => {
      if (isTranslated) { ui.translation = null; ui.translatingTo = null; refresh(); }
      else actTranslateSummary(doc, translateBtn, refresh);
    });
    controls.appendChild(translateBtn);

    const alreadySaved = doc.summary && Saved.has(doc.id, ui.translation || doc.summary);
    const saveBtn = el('button', {
      class: 'btn btn-ghost btn-sm',
      title: t('pdf.summary.save'),
      'aria-label': t('pdf.summary.save'),
      disabled: alreadySaved || (!doc.summary && !ui.translation)
    });
    saveBtn.innerHTML = (alreadySaved ? icons.check : icons.star) +
      '<span>' + escapeHtml(alreadySaved ? t('pdf.summary.alreadySaved') : t('pdf.summary.save')) + '</span>';
    saveBtn.addEventListener('click', () => {
      const content = ui.translation || doc.summary;
      if (!content) return;
      const entry = Saved.add({
        docId: doc.id, docName: doc.name, content,
        lang: ui.translatingTo || global.State.S.settings.uiLang
      });
      toast(entry ? t('pdf.summary.savedToast') : t('pdf.summary.alreadySaved'),
            entry ? 'success' : 'info');
      refresh();
    });
    controls.appendChild(saveBtn);

    if (doc.summary && !ui.loading) {
      const closeBtn = el('button', {
        class: 'icon-btn pdf-summary-close',
        title: t('pdf.summary.dismiss'),
        'aria-label': t('pdf.summary.dismiss'),
        html: icons.close
      });
      closeBtn.addEventListener('click', () => { ui.hidden = true; refresh(); });
      controls.appendChild(closeBtn);
    }
    head.appendChild(controls);
    card.appendChild(head);

    const body = el('div', { class: 'pdf-summary-body' });

    if (ui.loading) {
      body.appendChild(buildLoadingRow(t('pdf.qa.summarizing')));
    } else if (ui.error) {
      body.appendChild(buildErrorRow(ui.error, () => {
        ui.error = null;
        actSummarizeFromCard(doc, refresh);
      }));
    } else if (!doc.summary) {
      body.appendChild(el('div', { class:'pdf-summary-empty muted' },
        el('div', { class:'icon-wrap pdf-summary-empty-icon', html: icons.sparkle }),
        el('p', {}, t('pdf.summary.empty'))
      ));
    } else {
      const content = ui.translation || doc.summary;
      const para = el('div', { class: 'pdf-summary-content' });
      para.textContent = content;
      body.appendChild(para);

      if (ui.translation) {
        const tag = el('div', { class:'pdf-summary-flag' },
          el('span', { class:'badge badge-accent' },
            t('pdf.summary.translated') + ' \u2192 ' + (ui.translatingTo || '').toUpperCase())
        );
        body.appendChild(tag);
      }
    }
    card.appendChild(body);
    return card;
  }

  async function actTranslateSummary(doc, btn, refresh) {
    if (!global.AI.isReady()) { toast(t('chat.connectFirst'), 'warning'); return; }
    if (!doc.summary) return;
    const ui = getSumUI(doc.id);
    const target = (global.State.S.settings.uiLang === 'fr') ? 'fr' : 'en';
    const previous = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(t('pdf.summary.translating')) + '</span>';
    try {
      const translated = await global.AI.translate(doc.summary, 'auto', target);
      ui.translation = (translated || '').trim();
      ui.translatingTo = target;
      refresh();
    } catch (e) {
      toast(t('pdf.summary.translateErr') + ' ' + (e.message || ''), 'error');
      btn.innerHTML = previous;
      btn.disabled = false;
    }
  }

  async function actSummarizeFromCard(doc, refresh) {
    if (!global.AI.isReady()) { toast(t('chat.connectFirst'), 'warning'); return; }
    const ui = getSumUI(doc.id);
    ui.loading = true; ui.error = null; ui.translation = null; ui.translatingTo = null;
    refresh();
    try {
      const summary = await global.AI.summarizeText(doc.text);
      global.State.update(s => { const d = s.pdfs.find(p => p.id === doc.id); if (d) d.summary = summary; });
      ui.loading = false; refresh();
      toast(t('pdf.summarized'), 'success');
    } catch (e) {
      ui.loading = false;
      ui.error = e.message || 'Summarize failed.';
      refresh();
    }
  }

  /* ---------- Q&A panel ---------- */
  function buildQAPanel(doc, refresh) {
    const panel = el('section', { class: 'pdf-qa-panel', 'aria-label': t('pdf.qa.title') });
    panel.appendChild(el('div', { class:'pdf-qa-header' },
      el('h2', {}, t('pdf.qa.title'))
    ));

    const list = el('div', { class: 'pdf-qa-list' });
    if (!view.chat.length) {
      list.appendChild(el('div', { class:'pdf-qa-empty' },
        el('div', { class:'icon-wrap pdf-qa-empty-icon', html: icons.chat }),
        el('h3', {}, t('pdf.qa.empty.title')),
        el('p', { class:'muted' }, t('pdf.qa.empty.body'))
      ));
    } else {
      view.chat.forEach((m, i) => list.appendChild(renderQACard(m, i, doc, refresh)));
      if (view.askPending) list.appendChild(buildLoadingRow(t('pdf.qa.thinking')));
      if (view.askError) {
        list.appendChild(buildErrorRow(view.askError, () => { view.askError = null; refresh(); }));
      }
    }
    panel.appendChild(list);

    const composer = el('form', { class:'pdf-composer' });
    composer.addEventListener('submit', (e) => { e.preventDefault(); ask(); });
    const ta = el('textarea', {
      class: 'pdf-question accent-aware',
      rows: '2',
      placeholder: t('pdf.askPlaceholder'),
      'aria-label': t('pdf.askPlaceholder')
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); ask();
      }
    });
    const autoGrow = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(200, Math.max(72, ta.scrollHeight)) + 'px';
    };
    ta.addEventListener('input', autoGrow);
    const sendBtn = el('button', { class:'btn btn-primary pdf-send', type:'submit', 'aria-label': t('pdf.qa.send') });
    sendBtn.innerHTML = icons.send + '<span class="pdf-send-label">' + escapeHtml(t('pdf.qa.send')) + '</span>';
    composer.appendChild(ta);
    composer.appendChild(sendBtn);
    panel.appendChild(composer);
    setTimeout(autoGrow, 0);
    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);

    async function ask() {
      const q = ta.value.trim();
      if (!q) return;
      if (!global.AI.isReady()) { toast(t('chat.connectFirst'), 'warning'); return; }
      if (view.askPending) return;
      ta.value = ''; autoGrow();
      view.chat.push({ role:'user', content: q, ts: Date.now() });
      view.askPending = true;
      view.askError = null;
      refresh();
      try {
        const r = await global.AI.answerAboutDocument(q, doc.text);
        view.chat.push({ role:'assistant', content: r, ts: Date.now() });
        view.askPending = false;
        refresh();
      } catch (e) {
        view.askPending = false;
        view.askError = (e && e.message) || 'AI request failed.';
        refresh();
      }
    }

    return panel;
  }

  function renderQACard(m, idx, doc, refresh) {
    const isUser = m.role === 'user';
    const card = el('article', {
      class: 'pdf-qa-card pdf-qa-' + (isUser ? 'user' : 'assistant')
    });
    const head = el('div', { class:'pdf-qa-card-head' });
    head.appendChild(el('div', { class:'pdf-qa-role' },
      el('span', { class:'pdf-qa-avatar' + (isUser ? ' pdf-qa-avatar-user' : '') },
        isUser ? (global.Auth?.initials(global.State.S.user?.name) || 'You'.slice(0,2)) : 'AI'),
      el('div', { class:'pdf-qa-role-name' }, isUser ? t('pdf.qa.you') : t('pdf.qa.ai'))
    ));
    if (m.ts) {
      head.appendChild(el('div', { class:'pdf-qa-time text-xs muted' }, global.U.formatRelative(m.ts)));
    }
    card.appendChild(head);

    const bodyHost = el('div', { class:'pdf-qa-body' });
    const content = m._translation || m.content;
    bodyHost.innerHTML = global.U.renderMarkdownLite(content);
    card.appendChild(bodyHost);

    if (m._translation) {
      card.appendChild(el('div', { class:'pdf-qa-translated' },
        el('span', { class:'badge badge-accent' },
          t('pdf.summary.translated') + ' \u2192 ' + (m._translatedTo || '').toUpperCase())
      ));
    }

    const actions = el('div', { class:'pdf-qa-card-actions' });
    if (m._translation) {
      const orig = el('button', { class:'btn btn-ghost btn-sm' });
      orig.innerHTML = icons.refresh + '<span>' + escapeHtml(t('pdf.summary.original')) + '</span>';
      orig.addEventListener('click', () => {
        delete m._translation; delete m._translatedTo; refresh();
      });
      actions.appendChild(orig);
    } else {
      const tBtn = el('button', { class:'btn btn-ghost btn-sm' });
      tBtn.innerHTML = icons.wand + '<span>' + escapeHtml(t('pdf.summary.translate')) + '</span>';
      tBtn.addEventListener('click', async () => {
        if (!global.AI.isReady()) { toast(t('chat.connectFirst'), 'warning'); return; }
        const target = (global.State.S.settings.uiLang === 'fr') ? 'fr' : 'en';
        const prev = tBtn.innerHTML;
        tBtn.disabled = true;
        tBtn.innerHTML = '<span class="spinner"></span><span>' + escapeHtml(t('pdf.summary.translating')) + '</span>';
        try {
          const translated = await global.AI.translate(m.content, 'auto', target);
          m._translation = (translated || '').trim();
          m._translatedTo = target;
          refresh();
        } catch (e) {
          toast(t('pdf.summary.translateErr') + ' ' + (e.message || ''), 'error');
          tBtn.disabled = false;
          tBtn.innerHTML = prev;
        }
      });
      actions.appendChild(tBtn);
    }

    if (!isUser && m.content) {
      const saveBtn = el('button', { class:'btn btn-ghost btn-sm' });
      const already = Saved.has(doc.id, m._translation || m.content);
      saveBtn.disabled = already;
      saveBtn.innerHTML = (already ? icons.check : icons.star) +
        '<span>' + escapeHtml(already ? t('pdf.summary.alreadySaved') : t('pdf.summary.save')) + '</span>';
      saveBtn.addEventListener('click', () => {
        const content = m._translation || m.content;
        const entry = Saved.add({
          docId: doc.id, docName: doc.name,
          content, lang: m._translatedTo || global.State.S.settings.uiLang
        });
        toast(entry ? t('pdf.summary.savedToast') : t('pdf.summary.alreadySaved'),
              entry ? 'success' : 'info');
        refresh();
      });
      actions.appendChild(saveBtn);
    }

    if (actions.children.length) card.appendChild(actions);
    return card;
  }

  /* ---------- Saved summaries modal ---------- */
  function openSavedModal() {
    const body = el('div', { class:'col gap-12 pdf-saved-list' });

    function refreshList() {
      body.innerHTML = '';
      const items = Saved.list();
      if (!items.length) {
        body.appendChild(el('p', { class:'muted text-sm' }, t('pdf.saved.empty')));
        return;
      }
      items.forEach(s => body.appendChild(renderSavedItem(s, refreshList)));
    }
    refreshList();

    const close = el('button', { class:'btn btn-primary' }, t('common.close'));
    const m = modal({ title: t('pdf.saved.title'), body, footer: [close], size: 'lg' });
    close.addEventListener('click', m.close);
  }

  function renderSavedItem(s, refresh) {
    const card = el('article', { class:'pdf-saved-card card' });
    const head = el('div', { class:'pdf-saved-head' });
    head.appendChild(el('div', { class:'col flex-1', style:{ minWidth:0 } },
      el('div', { class:'pdf-saved-doc' }, s.docName || '(unknown)'),
      el('div', { class:'text-xs muted' },
        t('pdf.saved.savedAt', { when: global.U.formatRelative(s.savedAt) }) +
        (s.lang ? ' · ' + s.lang.toUpperCase() : '')
      )
    ));
    const removeBtn = el('button', {
      class:'icon-btn',
      title: t('pdf.saved.delete'),
      'aria-label': t('pdf.saved.delete'),
      html: icons.trash
    });
    removeBtn.addEventListener('click', () => {
      Saved.remove(s.id);
      if (refresh) refresh();
    });
    head.appendChild(removeBtn);
    card.appendChild(head);
    const content = el('div', { class:'pdf-saved-content' });
    content.textContent = s.content;
    card.appendChild(content);
    return card;
  }

  /* ---------- Loading & error rows ---------- */
  function buildLoadingRow(message) {
    const row = el('div', { class: 'pdf-loading-row' });
    row.appendChild(el('span', { class:'spinner spinner-lg' }));
    row.appendChild(el('div', { class:'col flex-1' },
      el('div', { style:{ fontWeight: 600 } }, message || t('common.loading'))
    ));
    return row;
  }

  function buildErrorRow(message, retry) {
    const row = el('div', { class: 'pdf-error-row' });
    row.appendChild(el('div', { class:'pdf-error-icon', html: '\u26a0\ufe0f' }));
    row.appendChild(el('div', { class:'col flex-1' },
      el('div', { style:{ fontWeight: 700, color: 'var(--danger)' } }, message)
    ));
    if (retry) {
      const r = el('button', { class:'btn btn-outline btn-sm' });
      r.innerHTML = icons.refresh + '<span>' + escapeHtml(t('pdf.summary.regenerate')) + '</span>';
      r.addEventListener('click', retry);
      row.appendChild(r);
    }
    return row;
  }

  function buildDropZone(refreshL, refreshR) {
    const zone = el('div', { class: 'pdf-drop' });
    zone.innerHTML = `
      <div class="icon-wrap">${icons.upload}</div>
      <h3>${escapeHtml(t('pdf.dropTitle'))}</h3>
      <p class="muted text-sm">${escapeHtml(t('pdf.dropBody'))}</p>
    `;
    const input = el('input', { type:'file', accept: 'application/pdf', style: { display: 'none' } });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => onFiles(input.files, refreshL, refreshR));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      onFiles(e.dataTransfer.files, refreshL, refreshR);
    });
    zone.appendChild(input);
    return zone;
  }

  function triggerUpload(refreshL, refreshR) {
    const input = el('input', { type:'file', accept:'application/pdf' });
    input.addEventListener('change', () => onFiles(input.files, refreshL, refreshR));
    input.click();
  }

  async function onFiles(files, refreshL, refreshR) {
    const file = files && files[0];
    if (!file) return;
    toast(t('pdf.parsing'), 'info', 1500);
    try {
      const parsed = await PDF.parseFile(file);
      const doc = PDF.save(parsed);
      view.activeId = doc.id;
      view.chat = [];
      refreshL(); refreshR();
      toast(`Loaded ${parsed.pages} pages`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function openExtractModal(rows) {
    const list = el('div', { class:'col gap-8', style:{ maxHeight:'400px', overflowY:'auto' } });
    rows.forEach((r, i) => {
      const item = el('label', { class: 'card card-pad-sm', style: { display:'flex', gap:'10px', alignItems:'flex-start', cursor:'pointer' } });
      const cb = el('input', { type:'checkbox', checked:true });
      cb.style.marginTop = '4px';
      cb.dataset.i = String(i);
      item.appendChild(cb);
      item.appendChild(el('div', { class:'flex-1' },
        el('div', { class:'row gap-8' },
          el('div', { style:{ fontWeight:700, fontFamily:'Fraunces, serif', fontSize:'1.05rem' } }, r.source || ''),
          el('div', { class:'muted', style:{ fontStyle:'italic' } }, r.target || '')
        ),
        r.definition ? el('div', { class:'text-sm muted' }, r.definition) : null,
        r.example ? el('div', { class:'text-sm', style:{ marginTop:'4px' } }, '\u201c' + r.example + '\u201d') : null
      ));
      list.appendChild(item);
    });

    const cancel = el('button', { class:'btn btn-ghost' }, t('common.cancel'));
    const ok     = el('button', { class:'btn btn-primary' }, t('common.add'));
    const { close } = modal({
      title: `Extracted ${rows.length} words`,
      body: list,
      footer: [cancel, ok],
      size: 'lg'
    });
    cancel.addEventListener('click', close);
    ok.addEventListener('click', () => {
      const checks = list.querySelectorAll('input[type="checkbox"]');
      const picked = Array.from(checks).filter(c => c.checked).map(c => rows[Number(c.dataset.i)]);
      const ids = global.Vocab.importMany(picked.map(r => ({ ...r, sourceType: 'pdf' })));
      close();
      toast(`Added ${ids.length} word${ids.length === 1 ? '' : 's'} \u2728`, 'success');
    });
  }

  global.PDF = PDF;
})(window);
