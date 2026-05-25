/* =================================================================
   PDF — upload, parse via pdf.js (CDN), AI Q&A, summarize, extract
   difficult vocabulary, and add directly to user's vocabulary list.
   ================================================================= */
(function (global) {
  'use strict';
  const { $, $$, el, escapeHtml, icons, toast, modal, confirmModal } = global.U;

  const view = {
    activeId: null,
    chat: []
  };

  const PDF = {
    async parseFile(file) {
      if (!file) throw new Error('No file selected.');
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        throw new Error('That doesn’t look like a PDF.');
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('PDFs above 25 MB aren’t supported here.');
      }
      if (!global.pdfjsLib) throw new Error('PDF engine failed to load. Refresh and try again.');
      const buf = await file.arrayBuffer();
      const pdf = await global.pdfjsLib.getDocument({ data: buf }).promise;
      const pages = pdf.numPages;
      let text = '';
      for (let p = 1; p <= pages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        const t = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
        text += t + '\n\n';
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
        el('h1', {}, 'PDF Learning'),
        el('p', { class: 'subtitle muted' }, 'Upload a PDF, ask questions about it, summarize, and extract advanced vocabulary.')
      ));
      wrap.appendChild(header);

      const shell = el('div', { class: 'pdf-shell' });
      const left  = el('div', { class: 'pdf-panel' });
      const right = el('div', { class: 'pdf-panel' });
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
        const meta = el('div', { class: 'pdf-doc-meta' }, docs.length ? `${docs.length} document${docs.length===1?'':'s'} saved` : 'No documents yet');
        const newBtn = el('button', { class: 'btn btn-primary' });
        newBtn.innerHTML = icons.upload + '<span>Upload PDF</span>';
        newBtn.addEventListener('click', () => triggerUpload(renderLeft, renderRight));
        top.appendChild(meta);
        top.appendChild(newBtn);
        left.appendChild(top);

        if (!docs.length) {
          left.appendChild(buildDropZone(renderLeft, renderRight));
          return;
        }

        const list = el('div', { class: 'col gap-8', style: { overflowY:'auto', flex:'1' } });
        docs.forEach(d => list.appendChild(buildDocItem(d, renderLeft, renderRight)));
        left.appendChild(list);

        if (!view.activeId) view.activeId = docs[0].id;
        const active = docs.find(d => d.id === view.activeId) || docs[0];
        if (active) {
          const preview = el('div', { class: 'pdf-text-view', style: { marginTop:'12px', maxHeight:'40vh' } });
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
          onclick: () => { view.activeId = d.id; refreshL(); refreshR(); }
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
            class: 'icon-btn', title: 'Delete',
            html: icons.trash, style: { width:'32px', height:'32px' },
            onclick: async (e) => {
              e.stopPropagation();
              const ok = await confirmModal({ title:'Remove PDF?', message:'This document and its chat will be deleted.', danger:true, confirmLabel:'Remove' });
              if (ok) { PDF.remove(d.id); if (view.activeId === d.id) view.activeId = null; refreshL(); refreshR(); toast('PDF removed', 'success'); }
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
            el('h3', {}, 'Pick a document'),
            el('p', { class:'muted' }, 'Upload a PDF on the left to start a conversation about it.')
          ));
          return;
        }

        const top = el('div', { class: 'pdf-toolbar' });
        top.appendChild(el('div', { class: 'pdf-doc-meta' }, doc.name));
        const sumBtn = el('button', { class: 'btn btn-secondary' });
        sumBtn.innerHTML = icons.sparkle + '<span>Summarize</span>';
        sumBtn.addEventListener('click', () => actSummarize(doc));

        const xVocab = el('button', { class: 'btn btn-secondary' });
        xVocab.innerHTML = icons.book + '<span>Extract vocab</span>';
        xVocab.addEventListener('click', () => actExtract(doc));

        const xQuiz = el('button', { class: 'btn btn-outline' });
        xQuiz.innerHTML = icons.target + '<span>Quiz me</span>';
        xQuiz.addEventListener('click', () => actQuiz(doc));

        top.appendChild(sumBtn);
        top.appendChild(xVocab);
        top.appendChild(xQuiz);
        right.appendChild(top);

        if (doc.summary) {
          const sum = el('div', { class: 'card card-pad-sm', style:{ marginBottom:'10px' } });
          sum.appendChild(el('div', { class:'eyebrow', style:{ marginBottom:'6px' } }, 'Summary'));
          sum.appendChild(el('div', { class:'text-sm', style:{ whiteSpace:'pre-wrap' } }, doc.summary));
          right.appendChild(sum);
        }

        // chat
        const chatBox = el('div', { class:'pdf-text-view', style:{ flex:'1', whiteSpace:'normal', fontFamily:'inherit' } });
        view.chat.forEach(m => chatBox.appendChild(renderChatRow(m)));
        if (!view.chat.length) {
          chatBox.appendChild(el('div', { class:'muted text-sm' }, 'Ask questions about this document — for example, "What is the main argument?" or "List the key terms used."'));
        }
        right.appendChild(chatBox);

        const composer = el('div', { class:'row gap-8 mt-12' });
        const ta = el('textarea', { rows:'1', placeholder:'Ask a question about this PDF…', style:{ minHeight:'42px' } });
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
        });
        const sendBtn = el('button', { class:'btn btn-primary', html: icons.send });
        sendBtn.addEventListener('click', ask);
        composer.appendChild(ta);
        composer.appendChild(sendBtn);
        right.appendChild(composer);

        async function ask() {
          const q = ta.value.trim();
          if (!q) return;
          if (!global.AI.isReady()) { toast('Connect an AI provider in Settings.', 'warning'); return; }
          ta.value = '';
          view.chat.push({ role:'user', content: q });
          renderRight();
          try {
            const r = await global.AI.answerAboutDocument(q, doc.text);
            view.chat.push({ role:'assistant', content: r });
          } catch (e) {
            view.chat.push({ role:'assistant', content: '⚠️ ' + e.message });
          }
          renderRight();
        }
      }

      async function actSummarize(doc) {
        if (!global.AI.isReady()) { toast('Connect an AI provider in Settings.', 'warning'); return; }
        toast('Summarizing…', 'info', 1200);
        try {
          const summary = await global.AI.summarizeText(doc.text);
          global.State.update(s => {
            const d = s.pdfs.find(p => p.id === doc.id);
            if (d) d.summary = summary;
          });
          renderRight();
          toast('Summary generated ✨', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }

      async function actExtract(doc) {
        if (!global.AI.isReady()) { toast('Connect an AI provider in Settings.', 'warning'); return; }
        toast('Finding difficult words…', 'info', 1500);
        try {
          const rows = await global.AI.extractDifficultWords(doc.text, global.State.S.settings.targetLang, 12);
          if (!rows.length) { toast('No vocabulary extracted.', 'warning'); return; }
          openExtractModal(rows);
        } catch (e) { toast(e.message, 'error'); }
      }

      function actQuiz(doc) {
        // Take the saved words tagged with this doc (extract+add does that)
        window.location.hash = `#/learn?mode=quiz&filter=all`;
      }
    }
  };

  function buildDropZone(refreshL, refreshR) {
    const zone = el('div', { class: 'pdf-drop' });
    zone.innerHTML = `
      <div class="icon-wrap">${icons.upload}</div>
      <h3>Drop a PDF here</h3>
      <p class="muted text-sm">Or click to browse from your device. Up to 25 MB.</p>
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
    toast('Parsing PDF…', 'info', 1500);
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

  function renderChatRow(m) {
    const wrap = el('div', { class: 'mb-12' });
    const label = el('div', { class:'text-xs muted', style:{ marginBottom:'4px' } }, m.role === 'user' ? 'You' : 'AI');
    const bubble = el('div', { class:'card card-pad-sm', style:{ background: m.role === 'user' ? 'rgb(var(--accent-rgb)/0.08)' : 'var(--surface-2)' } });
    bubble.innerHTML = global.U.renderMarkdownLite(m.content);
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    return wrap;
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
        r.example ? el('div', { class:'text-sm', style:{ marginTop:'4px' } }, '“' + r.example + '”') : null
      ));
      list.appendChild(item);
    });

    const cancel = el('button', { class:'btn btn-ghost' }, 'Cancel');
    const ok     = el('button', { class:'btn btn-primary' }, 'Add selected');
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
      toast(`Added ${ids.length} word${ids.length === 1 ? '' : 's'} ✨`, 'success');
    });
  }

  global.PDF = PDF;
})(window);
