/* =================================================================
   AI Service — unified facade above the provider adapters.
   - getActiveProvider() returns the user's default provider with
     decoded key, or null.
   - chat(messages, opts) routes to the active provider, or throws.
   - High-level helpers: enhanceWord, translate, generateExamples,
     extractDifficultPdfWords, summarizePdf, conjugate.
   ================================================================= */
(function (global) {
  'use strict';
  const { deobfuscate, obfuscate, toast } = global.U;

  const AI = {
    /** Return list of providers with status for Settings UI */
    listProviders() {
      const settings = global.State.S.settings;
      return global.AIProviders.list.map(id => {
        const def = global.AIProviders.byId(id);
        const cfg = settings.providers[id] || {};
        return {
          id, def,
          model: cfg.model || def.defaultModel,
          baseUrl: cfg.baseUrl || '',
          hasKey: !!cfg.keyEnc,
          isDefault: settings.defaultProvider === id
        };
      });
    },

    /** Active provider config (with decoded key) or null */
    getActive() {
      const settings = global.State.S.settings;
      const id = settings.defaultProvider;
      if (!id) return null;
      const def = global.AIProviders.byId(id);
      if (!def) return null;
      const cfg = settings.providers[id] || {};
      const key = deobfuscate(cfg.keyEnc || '');
      if (!key && !settings.proxy?.enabled) return null;
      return {
        id, def, key,
        model: cfg.model || def.defaultModel,
        baseUrl: cfg.baseUrl || ''
      };
    },

    isReady() { return !!this.getActive(); },

    /** Save / clear key for a given provider */
    saveKey(providerId, key) {
      global.State.update(s => {
        const p = s.settings.providers[providerId] = s.settings.providers[providerId] || {};
        p.keyEnc = key ? obfuscate(key) : '';
      });
    },

    setModel(providerId, model) {
      global.State.update(s => {
        const p = s.settings.providers[providerId] = s.settings.providers[providerId] || {};
        p.model = model;
      });
    },

    setBaseUrl(providerId, url) {
      global.State.update(s => {
        const p = s.settings.providers[providerId] = s.settings.providers[providerId] || {};
        p.baseUrl = url;
      });
    },

    setDefault(providerId) {
      global.State.set('settings.defaultProvider', providerId);
    },

    /** Test a provider's key */
    async testProvider(providerId) {
      const settings = global.State.S.settings;
      const def = global.AIProviders.byId(providerId);
      if (!def) return { ok: false, message: 'Unknown provider' };
      const cfg = settings.providers[providerId] || {};
      const key = deobfuscate(cfg.keyEnc || '');
      if (!key) return { ok: false, message: 'No key saved' };
      return def.testKey({ key, model: cfg.model, baseUrl: cfg.baseUrl });
    },

    /** Core chat call routed through active provider with fallbacks */
    async chat(messages, opts = {}) {
      const active = this.getActive();
      if (!active) {
        const err = new Error('No AI provider connected. Add a key in Settings → API Integrations.');
        err.code = 'NO_PROVIDER';
        throw err;
      }

      // Optional server proxy (kept generic)
      const proxy = global.State.S.settings.proxy;
      if (proxy?.enabled && proxy.url) {
        try {
          const res = await fetch(proxy.url, {
            method: 'POST',
            signal: opts.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: active.id, model: active.model,
              messages, temperature: opts.temperature ?? 0.4
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || `Proxy error ${res.status}`);
          return { content: data.content || '', raw: data, provider: active.id };
        } catch (e) {
          // Fall through to direct call if proxy fails
          console.warn('[AI] proxy failed, falling back to direct:', e.message);
        }
      }

      // Direct call
      const r = await active.def.chat({
        key: active.key,
        model: active.model,
        baseUrl: active.baseUrl,
        messages,
        signal: opts.signal,
        temperature: opts.temperature ?? 0.4
      });
      return { ...r, provider: active.id };
    },

    /** Try chat as JSON and parse leading JSON object/array. */
    async chatJSON(messages, opts = {}) {
      const r = await this.chat([
        ...messages,
        { role: 'system', content: 'Respond with valid JSON only — no prose, no markdown fences.' }
      ], opts);
      const txt = (r.content || '').trim();
      // Strip code fences if model included them
      const cleaned = txt
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      try {
        return { ...r, json: JSON.parse(cleaned) };
      } catch {
        // Try to find first {...} or [...] block
        const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
        if (m) {
          try { return { ...r, json: JSON.parse(m[0]) }; } catch { /* fallthrough */ }
        }
        const err = new Error('AI did not return valid JSON.');
        err.raw = r.content;
        throw err;
      }
    },

    /* ---------------- Higher-level helpers ---------------- */

    async enhanceWord(word, targetLang = 'fr') {
      const sys = `You are a helpful language tutor. The user is studying ${langName(targetLang)} from English. Given a single ${langName(targetLang)} word or expression, return a structured JSON object with: target (English translation), definition (1 sentence), example (a natural ${langName(targetLang)} sentence using the word), pos (part of speech), gender (if a noun: masculine/feminine/neuter; else empty), conjugation (1-line summary if a verb, e.g. "je vais, tu vas, il va"), difficulty (integer 1..5 by CEFR-ish), tags (array of 1-3 short tags).`;
      const r = await this.chatJSON([
        { role: 'system', content: sys },
        { role: 'user', content: `Word: ${word}\nReturn the JSON now.` }
      ], { temperature: 0.3 });
      return r.json || {};
    },

    async translate(text, fromLang = 'auto', toLang = 'en') {
      const sys = `You are a precise translator. Translate the user message ${fromLang === 'auto' ? '' : `from ${langName(fromLang)} `}into ${langName(toLang)}. Return only the translation as plain text — no commentary.`;
      const r = await this.chat([
        { role: 'system', content: sys },
        { role: 'user', content: text }
      ], { temperature: 0.2 });
      return (r.content || '').trim();
    },

    async generateExamples(word, targetLang = 'fr', count = 3) {
      const sys = `Provide ${count} natural ${langName(targetLang)} example sentences using the given word, each followed by an English translation. Format strictly as JSON array of {sentence, translation}.`;
      const r = await this.chatJSON([
        { role: 'system', content: sys },
        { role: 'user', content: `Word: ${word}` }
      ], { temperature: 0.6 });
      return Array.isArray(r.json) ? r.json : [];
    },

    async extractDifficultWords(text, targetLang = 'fr', max = 12) {
      const sys = `Extract up to ${max} of the most useful but advanced (B2+/C1) vocabulary words from the user's text. For each, return: source (the ${langName(targetLang)} word in dictionary form), target (English translation), definition (one short sentence), example (a short example sentence in ${langName(targetLang)}), difficulty (1..5). Return strictly a JSON array.`;
      const r = await this.chatJSON([
        { role: 'system', content: sys },
        { role: 'user', content: text.slice(0, 12000) }
      ], { temperature: 0.4 });
      return Array.isArray(r.json) ? r.json : [];
    },

    async summarizeText(text) {
      const sys = `Summarize the user's document in 4-6 concise bullet points. Use plain text bullets prefixed with "•".`;
      const r = await this.chat([
        { role: 'system', content: sys },
        { role: 'user', content: text.slice(0, 14000) }
      ], { temperature: 0.3 });
      return r.content || '';
    },

    async answerAboutDocument(question, docText) {
      const sys = `You are answering questions about a document the user uploaded. Use ONLY the provided document content to answer. If the answer is not in the document, say so plainly. Quote short snippets when helpful.`;
      const r = await this.chat([
        { role: 'system', content: sys },
        { role: 'user', content: `DOCUMENT:\n"""\n${docText.slice(0, 14000)}\n"""\n\nQUESTION: ${question}` }
      ], { temperature: 0.3 });
      return r.content || '';
    }
  };

  function langName(code) {
    return ({ fr:'French', es:'Spanish', de:'German', it:'Italian', pt:'Portuguese',
              ja:'Japanese', ko:'Korean', zh:'Chinese (Simplified)', en:'English' })[code] || code;
  }

  global.AI = AI;
})(window);
