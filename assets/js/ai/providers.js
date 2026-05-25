/* =================================================================
   AI Providers — definitions and request adapters for OpenAI,
   Google Gemini, Groq, and NVIDIA. Each adapter implements:
     async chat({ messages, model, signal })  -> { content, raw }
     async testKey({ key, model })            -> { ok, message }
   The unified service in ai/service.js calls these.
   ================================================================= */
(function (global) {
  'use strict';

  /** Convert OpenAI-style messages into a single string for providers
      without role messages. */
  function flattenMessages(messages) {
    return messages.map(m => {
      if (m.role === 'system') return `[SYSTEM]\n${m.content}\n`;
      if (m.role === 'user')   return `User: ${m.content}`;
      if (m.role === 'assistant') return `Assistant: ${m.content}`;
      return m.content;
    }).join('\n\n');
  }

  async function readJsonOrThrow(res) {
    let body;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  /* ---------- OpenAI ---------- */
  const openai = {
    id: 'openai',
    name: 'OpenAI',
    color: '#10a37f',
    initials: 'OA',
    docs: 'https://platform.openai.com/account/api-keys',
    description: 'GPT-4o family. The most capable models for nuanced language tasks.',
    keyHint: 'sk-…',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini'],

    async chat({ key, model, baseUrl, messages, signal, temperature = 0.4 }) {
      const url = (baseUrl || this.defaultBaseUrl).replace(/\/+$/, '') + '/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: model || this.defaultModel,
          messages,
          temperature
        })
      });
      const data = await readJsonOrThrow(res);
      const content = data?.choices?.[0]?.message?.content || '';
      return { content, raw: data };
    },

    async testKey({ key, model, baseUrl }) {
      try {
        const r = await this.chat({ key, model, baseUrl,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
        return { ok: true, message: 'Connected. Sample reply: ' + (r.content || '').slice(0, 40) };
      } catch (e) { return { ok: false, message: e.message }; }
    }
  };

  /* ---------- Google Gemini ---------- */
  const gemini = {
    id: 'gemini',
    name: 'Google Gemini',
    color: '#4285f4',
    initials: 'GG',
    docs: 'https://aistudio.google.com/app/apikey',
    description: 'Gemini 1.5 family. Long-context multimodal models from Google.',
    keyHint: 'AIza…',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro', 'gemini-2.0-flash'],

    _toGeminiContents(messages) {
      // Gemini uses { contents: [{ role, parts:[{text}] }] } and a system_instruction
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const turns = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }]
      }));
      return { sys, contents: turns };
    },

    async chat({ key, model, baseUrl, messages, signal, temperature = 0.4 }) {
      const m = model || this.defaultModel;
      const url = (baseUrl || this.defaultBaseUrl).replace(/\/+$/, '') +
        `/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`;
      const { sys, contents } = this._toGeminiContents(messages);
      const body = {
        contents,
        generationConfig: { temperature }
      };
      if (sys) body.systemInstruction = { role: 'system', parts: [{ text: sys }] };

      const res = await fetch(url, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await readJsonOrThrow(res);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const content = parts.map(p => p.text || '').join('');
      return { content, raw: data };
    },

    async testKey({ key, model, baseUrl }) {
      try {
        const r = await this.chat({ key, model, baseUrl,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
        return { ok: true, message: 'Connected. Sample reply: ' + (r.content || '').slice(0, 40) };
      } catch (e) { return { ok: false, message: e.message }; }
    }
  };

  /* ---------- Groq ---------- */
  const groq = {
    id: 'groq',
    name: 'Groq',
    color: '#f55036',
    initials: 'GQ',
    docs: 'https://console.groq.com/keys',
    description: 'Ultra-fast inference for Llama, Mixtral, and Gemma models.',
    keyHint: 'gsk_…',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],

    async chat(opts) { return openai.chat.call(this, opts); },
    async testKey(opts) { return openai.testKey.call(this, opts); }
  };

  /* ---------- NVIDIA NIM (OpenAI-compatible) ---------- */
  const nvidia = {
    id: 'nvidia',
    name: 'NVIDIA',
    color: '#76b900',
    initials: 'NV',
    docs: 'https://build.nvidia.com',
    description: 'NVIDIA NIM hosted inference for Llama, Nemotron, Mistral, and more.',
    keyHint: 'nvapi-…',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    models: [
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.1-8b-instruct',
      'mistralai/mixtral-8x7b-instruct-v0.1',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'google/gemma-2-9b-it'
    ],

    async chat(opts) { return openai.chat.call(this, opts); },
    async testKey(opts) { return openai.testKey.call(this, opts); }
  };

  global.AIProviders = {
    openai, gemini, groq, nvidia,
    list: ['openai', 'gemini', 'groq', 'nvidia'],
    byId: (id) => ({ openai, gemini, groq, nvidia })[id] || null
  };
})(window);
