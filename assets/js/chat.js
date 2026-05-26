/* =================================================================
   Chat — AI tutor with vocabulary context and lightweight tool calls.
   Tools the AI can request via a JSON action block:
     { "action":"add_word",        "word":{...} }
     { "action":"update_word",     "id":"...", "patch":{...} }
     { "action":"add_words_batch", "words":[...] }
     { "action":"start_quiz",      "filter":"due"|"weak"|"all" }
   We parse those, apply them, and show the user a confirmation pill.
   ================================================================= */
(function (global) {
  'use strict';
  const { $, $$, el, escapeHtml, icons, toast, renderMarkdownLite, debounce } = global.U;

  const Chat = {
    aborter: null,

    renderView(container) {
      container.innerHTML = '';
      const wrap = el('section', { class: 'view' });

      const header = el('div', { class: 'view-header' });
      header.appendChild(el('div', { class: 'flex-1' },
        el('h1', {}, t('chat.title')),
        el('p', { class: 'subtitle muted' }, t('chat.subtitle'))
      ));
      const actions = el('div', { class: 'actions' });
      const clearBtn = el('button', { class:'btn btn-ghost' });
      clearBtn.innerHTML = icons.trash + '<span>' + escapeHtml(t('chat.clearChat')) + '</span>';
      clearBtn.addEventListener('click', () => {
        global.State.update(s => { s.chat.messages = []; });
        renderMessages();
        toast(t('chat.cleared'), 'success');
      });
      actions.appendChild(clearBtn);
      header.appendChild(actions);
      wrap.appendChild(header);

      const shell = el('div', { class: 'chat-shell' });
      const messagesEl = el('div', { class: 'chat-messages', id: 'chat-messages' });
      const composer = el('div', { class: 'chat-composer' });
      const ta = el('textarea', { placeholder: t('chat.placeholder'), rows:'1', class:'accent-aware' });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
      });
      const sendBtn = el('button', { class: 'chat-send', 'aria-label': 'Send' });
      sendBtn.innerHTML = icons.send;
      sendBtn.addEventListener('click', send);
      composer.appendChild(ta);
      composer.appendChild(sendBtn);
      shell.appendChild(messagesEl);
      shell.appendChild(composer);
      wrap.appendChild(shell);
      container.appendChild(wrap);

      renderMessages();
      ta.focus();

      function renderMessages() {
        const msgs = global.State.S.chat.messages;
        messagesEl.innerHTML = '';
        if (!msgs.length) {
          messagesEl.appendChild(buildEmpty(send));
          return;
        }
        msgs.forEach(m => messagesEl.appendChild(renderMsg(m)));
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      async function send() {
        const text = ta.value.trim();
        if (!text) return;
        if (!global.AI.isReady()) {
          toast(t('chat.connectFirst'), 'warning');
          return;
        }
        ta.value = ''; ta.style.height = 'auto';
        const userMsg = { id: global.U.uuid(), role: 'user', content: text, ts: Date.now() };
        global.State.update(s => { s.chat.messages.push(userMsg); });
        renderMessages();

        // typing indicator
        const typing = el('div', { class: 'msg msg-assistant' },
          el('div', { class:'msg-avatar' }, 'AI'),
          el('div', { class:'msg-bubble' }, el('div', { class:'typing' }, el('span'), el('span'), el('span')))
        );
        messagesEl.appendChild(typing);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
          if (Chat.aborter) Chat.aborter.abort();
          Chat.aborter = ('AbortController' in window) ? new AbortController() : null;
          const replyText = await Chat.run(text, { signal: Chat.aborter?.signal });
          typing.remove();
          const action = parseActionBlock(replyText);
          let actionResult = null;
          if (action) {
            actionResult = await applyAction(action);
          }
          const aiMsg = {
            id: global.U.uuid(), role: 'assistant',
            content: stripActionBlock(replyText),
            ts: Date.now(),
            action: actionResult
          };
          global.State.update(s => { s.chat.messages.push(aiMsg); });
          renderMessages();
        } catch (err) {
          typing.remove();
          const aiMsg = {
            id: global.U.uuid(), role: 'assistant',
            content: '⚠️ ' + (err.message || 'Something went wrong.'),
            ts: Date.now()
          };
          global.State.update(s => { s.chat.messages.push(aiMsg); });
          renderMessages();
        }
      }
    },

    async run(userText, opts = {}) {
      const sys = buildSystemPrompt();
      const history = global.State.S.chat.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
      const messages = [
        { role: 'system', content: sys },
        ...history,
        { role: 'user', content: userText }
      ];
      const r = await global.AI.chat(messages, opts);
      return r.content || '';
    }
  };

  function buildEmpty(sendCb) {
    const wrap = el('div', { class: 'chat-empty' });
    wrap.appendChild(el('div', { class: 'pulse', html: icons.bot }));
    wrap.appendChild(el('h2', {}, t('chat.empty.title')));
    wrap.appendChild(el('p', { class: 'muted' }, t('chat.empty.body')));
    const grid = el('div', { class: 'suggested-grid' });
    [
      'What does "flâner" mean?',
      'How do I conjugate "aller" in past tense?',
      'Give me 3 example sentences with "dépayser".',
      'Add the word "ravissant" to my vocabulary.',
      'Explain the difference between "savoir" and "connaître".',
      'Quiz me on my weak words.'
    ].forEach(text => {
      const c = el('button', { class: 'suggested-chip' }, text);
      c.addEventListener('click', () => {
        const ta = $('.chat-composer textarea');
        if (ta) { ta.value = text; ta.focus(); }
      });
      grid.appendChild(c);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function renderMsg(m) {
    const wrap = el('div', { class: `msg msg-${m.role === 'user' ? 'user' : 'assistant'}` });
    if (m.role !== 'user') {
      wrap.appendChild(el('div', { class: 'msg-avatar' }, 'AI'));
    }
    const bubble = el('div', { class: 'msg-bubble' });
    bubble.innerHTML = renderMarkdownLite(m.content);
    if (m.action) {
      const r = el('div', { class: 'msg-action-result' });
      r.textContent = m.action.label || 'Action applied';
      bubble.appendChild(r);
    }
    wrap.appendChild(bubble);
    return wrap;
  }

  function buildSystemPrompt() {
    const settings = global.State.S.settings;
    const tlang = langName(settings.targetLang || 'fr');
    const vocab = global.State.S.vocab.slice(0, 80).map(w => ({
      id: w.id, source: w.source, target: w.target, status: w.srs?.status || 'new'
    }));
    return [
      `You are Frenmot, a warm and concise ${tlang} language tutor.`,
      `Always teach in clear English with ${tlang} examples. When asked, give pronunciation hints, grammar notes, and natural example sentences.`,
      `If the user asks you to add, update, or quiz on vocabulary, you MAY append ONE JSON action block at the very end of your reply, on its own lines, fenced like:`,
      '```json',
      '{ "action": "add_word", "word": { "source":"flâner", "target":"to stroll aimlessly", "definition":"...", "example":"...", "pos":"verb", "difficulty":3, "tags":["literary"] } }',
      '```',
      `Supported actions: "add_word" (single), "add_words_batch" (array of word objects under "words"), "update_word" (with "id" + "patch"), "start_quiz" ({"filter":"due|weak|all"}).`,
      `Only emit an action when the user explicitly requested it. Otherwise omit it. Keep regular replies concise (under 200 words unless asked).`,
      `The user's saved vocabulary (id → word/translation/status):`,
      JSON.stringify(vocab)
    ].join('\n');
  }

  function langName(code) {
    return ({ fr:'French', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese',
              ja:'Japanese', ko:'Korean', zh:'Chinese', en:'English' })[code] || code;
  }

  /* ----- Action block parsing ----- */
  function parseActionBlock(text) {
    if (!text) return null;
    const fence = text.match(/```json\s*([\s\S]*?)```/i);
    let candidate = null;
    if (fence) candidate = fence[1].trim();
    else {
      const last = text.lastIndexOf('{');
      if (last >= 0) candidate = text.slice(last);
    }
    if (!candidate) return null;
    try {
      const obj = JSON.parse(candidate);
      if (obj && obj.action) return obj;
    } catch { /* ignore */ }
    return null;
  }
  function stripActionBlock(text) {
    if (!text) return '';
    return text
      .replace(/```json\s*[\s\S]*?```/i, '')
      .replace(/\n*\{[\s\S]*?"action"[\s\S]*?\}\s*$/, '')
      .trim();
  }

  async function applyAction(action) {
    try {
      if (action.action === 'add_word' && action.word?.source) {
        const id = global.Vocab.upsertBySource({ ...action.word, sourceType: 'ai' });
        return { ok: true, label: `Added “${action.word.source}” to vocabulary.` };
      }
      if (action.action === 'add_words_batch' && Array.isArray(action.words)) {
        const ids = global.Vocab.importMany(action.words.map(w => ({ ...w, sourceType: 'ai' })));
        return { ok: true, label: `Added ${ids.length} word${ids.length === 1 ? '' : 's'} to vocabulary.` };
      }
      if (action.action === 'update_word' && action.id && action.patch) {
        global.Vocab.update(action.id, action.patch);
        return { ok: true, label: `Updated word.` };
      }
      if (action.action === 'start_quiz') {
        global.App.navigateTo('learn', { mode: 'quiz', filter: action.filter || 'due' });
        return { ok: true, label: 'Starting quiz…' };
      }
    } catch (e) {
      return { ok: false, label: 'Action failed: ' + e.message };
    }
    return null;
  }

  global.Chat = Chat;
})(window);
