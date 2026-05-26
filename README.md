# 🇫🇷 Frenmot — Your Personal Language Learning Companion

> **Live App →** [frenmot.web.app](https://frenmot.web.app)

A **local-first**, **zero-backend** language learning web app for building vocabulary, drilling words with spaced repetition, looking up French verb conjugations, chatting with an AI tutor, and learning from your own PDFs. Bring your own AI key — Frenmot itself runs entirely in your browser and never touches a server we operate.

![Frenmot Preview](readme_frenmot.png)

---

## Table of Contents

- [What it does](#what-it-does)
- [Features at a glance](#features-at-a-glance)
- [Try it out](#try-it-out)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [How data is stored](#how-data-is-stored)
- [Deploying your own copy](#deploying-your-own-copy)
- [Privacy & security](#privacy--security)
- [Roadmap](#roadmap)
- [License](#license)

---

## What it does

Frenmot is a single-page web app that combines five things into one tool:

1. **A vocabulary manager** — add, organize, tag, search, import, and export words you want to learn.
2. **A spaced-repetition scheduler** — every word is queued for review on a schedule that grows as you remember it (SM-2 inspired).
3. **An offline French conjugation engine** — search any French verb, see all major tenses, and save it to your study list as a verb in one click.
4. **An AI tutor** — chat with OpenAI, Google Gemini, Groq, or NVIDIA models using your own API key. The tutor knows your saved vocabulary and can add words on your behalf.
5. **A PDF learning workspace** — drop in a PDF, get a summary you can save / hide / translate, ask questions about it in roomy Q&A cards, and pull advanced vocabulary out of it directly into your study list.

The default target language is French, but the data model is language-agnostic. You can pick from 8 target languages on the welcome screen (French, Spanish, German, Italian, Portuguese, Japanese, Korean, Chinese). The **interface itself** can also be switched between English and French via the top-right `EN / FR` toggle.

---

## Features at a glance

### 🧠 Vocabulary management
- Add, edit, delete words with translation, definition, example, part of speech, gender, conjugation notes, tags, and difficulty (1–5).
- Search and filter by status (new / learning / reviewing / mastered / due now), tag, alphabetical, difficulty, or due date.
- Bulk **import** (paste JSON or simple `word — translation` lines) and **export** as JSON.
- **Enhance with AI** sits beside *Add a New Word* in the header, auto-fills missing fields from a single word.
- French-only fields (the word itself, the example, the conjugation notes) get an **accented-letter popup** on focus — click `é à ç ê œ` etc. to insert at the cursor without losing focus.

### 🔁 Spaced Repetition (SRS)
- Modified **SM-2 algorithm** with a tunable interval ladder, ease factor, easy bonus, and hard penalty.
- Four-button confidence grading on each flashcard (`Again`, `Hard`, `Good`, `Easy`) with predicted intervals shown live.
- Status tracking: words flow `new → learning → reviewing → mastered` based on repetitions and ease.
- Streaks, accuracy, weekly review chart, and daily-review reminders.

### 🎯 Practice modes
Six different ways to drill, each in its own focused full-screen session:

| Mode | What it does |
|---|---|
| **Flashcards** | Classic flip card with confidence buttons. Drives the SRS scheduler. |
| **Multiple choice** | Pick the right translation from 4 options. |
| **Typing recall** | Type the answer — accent-tolerant comparison, accent popup helps you type French. |
| **Listen & choose** | Hear the word via the browser's Web Speech API and pick its meaning. |
| **Conjugation drill** | Practice verb forms — strictly verb-only, with offline reference forms. |
| **Weak words** | Focused session of words with the lowest ease factor. |

### 🔤 Conjugation (left-sidebar route)
- Search any French infinitive, even if it's not in your vocabulary.
- **Offline** rule-based engine for regular `-er`, group-2 `-ir/-iss`, and 20+ irregulars (être, avoir, aller, faire, dire, voir, prendre, mettre, savoir, pouvoir, vouloir, devoir, venir, partir, sortir, dormir, lire, écrire, connaître, attendre).
- All major tenses: Présent, Passé composé, Imparfait, Futur simple, Conditionnel, Subjonctif, Impératif, Plus-que-parfait.
- **AI fallback** for verbs not in the offline dictionary (uses your configured AI provider).
- One-click **Save to vocabulary** — saved verbs are tagged `pos: 'verb'` so they automatically appear in the Conjugation Drill.

### 🤖 AI Tutor (Bring Your Own Key)
- Four providers supported, all with their own free tiers:
  - **OpenAI** — `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1`, `o3-mini`
  - **Google Gemini** — `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash` (default), `gemini-2.0-flash-lite`, `gemini-1.5-flash-latest`, `gemini-1.5-pro-latest`. Includes a runtime fallback chain when a model is retired, plus a "refresh model list" button that queries the live `models` endpoint.
  - **Groq** — `llama-3.3-70b-versatile`, Llama 3.1, Mixtral, Gemma 2 (ultra-fast inference)
  - **NVIDIA NIM** — Llama 3.1, Nemotron, Mistral, Gemma 2
- Pick a default provider; all features (chat, enhance-word, summarize, extract, PDF Q&A, translate, conjugate) route to it.
- The tutor's prompt includes a snapshot of your saved vocabulary, so it can reference your words by name.
- The tutor can request **tool actions** by appending a structured JSON block to its reply: `add_word`, `add_words_batch`, `update_word`, `start_quiz`. Frenmot parses these, applies them, and shows a confirmation pill.
- Optional **server proxy** mode in Settings → AI: point Frenmot at any HTTP endpoint that accepts `{provider, model, messages, temperature}` and returns `{content}` if you'd rather keep your key off the device entirely.

### 📄 PDF Learning
- Drop a PDF (up to 25 MB) onto the upload zone — parsed in-browser with [PDF.js](https://mozilla.github.io/pdf.js/).
- **Summary card** with three controls: `×` close (hides without deleting, slim restore strip remains), **Save** (stores the summary in your saved-summaries store with dedupe), **Translate** (flips between original and the current UI language).
- **Saved summaries** are persisted to local storage and accessible via a `View saved (N)` button on the PDF view header. Each saved entry tracks source PDF, save time, and language.
- **Q&A** — ask anything about the document; answers are grounded in the PDF text only. Each Q and A turn lives in its own roomy card with per-card translate and save controls. Loading and error states are first-class.
- **Extract advanced vocabulary** (B2+/C1) with translations, definitions, and examples — pick what you want and add to your vocabulary list with one click.
- **Quiz me** jumps you straight into a multiple-choice session over your vocabulary.

### 🌐 Site-wide English ↔ French interface
- Top-right `EN / FR` toggle in the topbar switches the entire UI live.
- Tiny `t(key, params)` translator with `{placeholder}` substitution and `{s}` for simple plurals.
- ~260 keys covering all 8 routes, modals, empty states, and toasts. Both dictionaries are kept in sync automatically.
- Choice persists in `settings.uiLang`.

### 🔔 Daily Reminders
- Optional time-of-day reminder using the browser's native Notifications API.
- Falls back to in-app banners if notifications are blocked or unsupported.
- Smart "you missed yesterday" prompt to keep streaks alive.

### 🎨 Design system
- Light / Dark / System theme.
- Six accent palettes: `indigo`, `rose`, `emerald`, `amber`, `sky`, `violet`.
- Two display fonts (Inter for UI, Fraunces for headings) loaded from Google Fonts.
- Responsive layout: sidebar on desktop, bottom-nav on mobile, slide-out drawer between.
- Reduced-motion support, keyboard shortcuts (`/` focuses search), accessible modals.
- Profile-button menu in the sidebar footer for quick access to Settings and Log out.

### 🗂️ Data control
- **Export** your full state (vocab, PDFs, settings, progress, AI keys, saved summaries) as a single JSON file.
- **Import** a backup to restore on another device or browser.
- **Reset** wipes both layers of local storage (localStorage + IndexedDB) with a confirmation.
- All API keys travel with your export — switching browsers is a manual export/import.

---

## Try it out

You don't need to install anything to use the live app. For local development:

```bash
git clone https://github.com/JustinDcosta/Frenmot-Your-Personal-French-Learning-Companion.git
cd Frenmot-Your-Personal-French-Learning-Companion

# Any static file server works. Pick one:
npx -y serve .            # Node
python -m http.server 8000   # Python
php -S localhost:8000        # PHP
```

Then open `http://localhost:8000` (or whatever port your server prints).

There is **no build step**, **no `npm install`**, and **no environment variables**. The app is just static HTML, CSS, and JS files.

To try the AI features you'll need an API key from one of the supported providers. All of them have generous free tiers:

- OpenAI — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Google Gemini — [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Groq — [console.groq.com/keys](https://console.groq.com/keys)
- NVIDIA — [build.nvidia.com](https://build.nvidia.com)

Paste the key into **Settings → AI Integrations**, hit **Test**, then **Set default**. You're done.

---

## Architecture

Frenmot is **vanilla JavaScript**, **no framework**, **no bundler**. The browser loads `index.html`, which loads 19 small JS modules in order. Each module attaches a single object to `window` (e.g. `window.State`, `window.Vocab`, `window.AI`) and the modules talk to each other through a tiny event bus (`U.bus`).

### The stack

| Layer | Technology | Why |
|---|---|---|
| Markup | HTML5 | Semantic, accessible. |
| Styling | Custom CSS (no Tailwind) | A small token-based design system in `styles.css`. Light/dark and accent palettes are CSS custom properties. |
| Logic | Vanilla ES6+ JavaScript | Zero dependencies, maximum control, instant load. |
| PDF parsing | [PDF.js](https://mozilla.github.io/pdf.js/) (CDN) | Battle-tested, works entirely client-side. |
| TTS | Web Speech API (`speechSynthesis`) | Free, native, no API call. |
| Persistence | localStorage + IndexedDB mirror | Durable across browser restarts and partial cache clears. |
| Hosting | Firebase Hosting | Free tier, global CDN, automatic SSL. |

### State, persistence, and the event bus

`state.js` holds a single in-memory `S` object that is the source of truth for the entire app. Every UI module reads from `S` and writes through `State.set(path, value)` or `State.update(fn)`.

Persistence is **two-layer**:

1. **localStorage** is the primary read/write path — synchronous and fast.
2. **IndexedDB** is an async mirror with a much larger quota.

On every write, the value is stored in localStorage *and* asynchronously mirrored to IndexedDB. On boot, if localStorage is empty but IndexedDB has a copy (e.g. the user cleared cookies but not site storage), `storage.get()` schedules a recovery and emits `storage:restored`, which `state.js` picks up and reloads into memory. The app also calls `navigator.storage.persist()` once on boot so the browser is less likely to evict the data under disk pressure.

The save path is debounced by 60 ms to coalesce bursts of writes. `pagehide` and `beforeunload` listeners flush the pending write so closing a tab mid-burst doesn't lose data. `State.flush()` is also called explicitly on logout.

### Hash-based router

`app.js` is the entry point. It uses a hash-based router (`#/dashboard`, `#/vocabulary`, …) and renders one of eight views into `<main id="main">`:

```
ROUTES = ['dashboard', 'vocabulary', 'review', 'learn', 'chat', 'pdf', 'conjugation', 'settings']
```

Each view module exposes a single `renderView(container)` (or `renderView(container, params)`) function that the router calls. Views are re-rendered from scratch on every route change.

`App.navigateTo(name, params)` is the safe way to navigate even from inside a view that has already taken over `#main` — it detects same-hash navigation and force-re-renders so back buttons inside practice sessions reliably return to the practice hub.

### AI integration

`ai/providers.js` defines four provider adapters that all expose `chat({ key, model, baseUrl, messages, signal, temperature })` and `testKey({ key, model, baseUrl })`. OpenAI, Groq, and NVIDIA all share the OpenAI Chat Completions wire format; Gemini has its own `contents[]` shape and gets a separate adapter that also implements a `listModels()` call against the live API.

`ai/service.js` is the unified facade. It reads the active provider from `settings.defaultProvider`, decodes the API key (XOR + base64 obfuscation), optionally routes through a user-configured proxy, scrubs API keys from any log line, and exposes high-level helpers used everywhere else in the app:

- `enhanceWord(word, lang)` — fills out a vocabulary card from a single word.
- `translate(text, from, to)` — quick translation (used by the PDF translate button).
- `extractDifficultWords(text, lang, max)` — pull advanced vocab from a chunk of text.
- `summarizeText(text)` — bullet-point summary.
- `answerAboutDocument(question, docText)` — RAG-style PDF Q&A.
- `chatJSON(messages)` appends a "respond with JSON only" instruction, parses fences, and returns either the JSON or a useful error.

For Gemini specifically, the `chat()` adapter walks a fallback chain (`gemini-2.0-flash → gemini-2.5-flash → gemini-1.5-flash-latest`) when the configured model 404s as "not found / not supported for generateContent", so transient model retirements don't break the app.

---

## Project structure

```
Frenmot/
├── index.html             # App shell: auth screen, sidebar, topbar, main container, modals, scripts
├── verbs.json             # 7,000+ French infinitives in 3 conjugation groups (used by conjugation.js)
├── app_logo.png           # App icon used as favicon and avatar fallback
├── readme_frenmot.png     # Preview screenshot for this README
├── privacy.html           # Privacy policy (linked from the auth screen)
├── tos.html               # Terms of service
├── firebase.json          # Firebase Hosting config (rewrites all paths to /index.html)
├── .firebaserc            # Firebase project alias (default: frenmot)
├── LICENSE                # MIT
└── assets/
    ├── css/
    │   └── styles.css     # Design system: tokens, components, layouts, dark mode, all view styles
    └── js/
        ├── utils.js          # DOM helpers, icons, toast, modal, storage (localStorage + IDB), event bus, TTS
        ├── state.js          # Central state, schema, persistence, migration, pagehide flush
        ├── i18n.js           # English / French dictionary translator with t(key, params)
        ├── accents.js        # French accented-letter popup (auto-mounts on focus)
        ├── theme.js          # Light/dark/system + accent palette switcher
        ├── auth.js           # Local-only account model (login/logout)
        ├── srs.js            # SM-2 variant: scheduling, grading, summary stats
        ├── vocab.js          # Vocabulary CRUD + the Vocabulary view UI
        ├── conjugation.js    # Offline French conjugation engine (rules + irregulars + AI fallback)
        ├── conj_view.js      # The Conjugation route view
        ├── notifications.js  # Daily reminder scheduling
        ├── dashboard.js      # Dashboard view (stats, recent words, AI status, weekly chart)
        ├── learn.js          # Practice hub + 6 practice modes + Review view
        ├── chat.js           # AI tutor view + tool-action parser
        ├── pdf.js            # PDF upload, parsing, summary card, Q&A, vocab extraction, saved summaries
        ├── settings.js       # Settings view: General / AI / SRS / Reminders / Data tabs
        ├── app.js            # Entry point: router, sidebar/topbar/bottom-nav wiring, performLogout, init
        └── ai/
            ├── providers.js  # Adapters for OpenAI, Gemini, Groq, NVIDIA (with Gemini fallback chain)
            └── service.js    # Unified AI facade and high-level helpers (with API-key sanitization)
```

---

## How data is stored

All your data — vocabulary, PDFs, saved summaries, chat history, settings, API keys, review streaks — lives **only on your device**. Frenmot does not have a backend server. There is no account creation, no cloud sync, no telemetry, no analytics.

### Where exactly?

Two layers:

1. **`localStorage`** under the key `frenmot:state` — a single JSON blob.
2. **IndexedDB** database `frenmot-db`, store `kv`, key `frenmot:state` — a mirror of the same blob.

Why both? localStorage is fast and synchronous (perfect for the boot path), but it has a small quota (5–10 MB) and is more aggressively cleared by browsers. IndexedDB has a much larger quota and survives some clear-data actions that wipe localStorage. Frenmot writes to both layers and recovers from the mirror automatically if localStorage gets wiped.

### What's protected against?

| Action | Data survives? |
|---|---|
| Closing the tab and reopening | ✅ Yes |
| Restarting the browser | ✅ Yes |
| Restarting the device | ✅ Yes |
| Browser update | ✅ Yes |
| Clearing cookies only | ✅ Yes (recovered from IndexedDB) |
| Clearing site data / cache + cookies + storage | ❌ No (use Export first) |
| Switching to a different browser | ❌ No (use Export → Import) |
| Switching to a different device | ❌ No (use Export → Import) |
| Browser running out of disk and evicting data | ⚠️ Mitigated by `navigator.storage.persist()` request, but not guaranteed |

### How do I move my data to another browser/device?

**Settings → Data → Export** downloads your full state as a single JSON file. Open Frenmot on the other browser/device and use **Settings → Data → Import** to load it. Everything — words, progress, PDFs, saved summaries, settings, even your AI keys — round-trips through this file.

### About API key storage

API keys are stored in the same JSON blob with a lightweight XOR+base64 obfuscation. This is **not encryption** — it's a best-effort measure to keep raw keys out of the browser DevTools "Application" tab as plaintext. Two recommendations:

- Use API keys with **per-key spending limits** so a stolen key has a bounded impact.
- For maximum security, configure the optional **server proxy** in Settings → AI → Server proxy. The proxy holds the real key on a server you control, and Frenmot only sends it `{provider, model, messages, temperature}`.

---

## Deploying your own copy

Frenmot deploys cleanly to **any static host**: Firebase Hosting, Netlify, Cloudflare Pages, GitHub Pages, Vercel, or even a USB stick.

The repo is configured for Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick or create a Firebase project
firebase deploy --only hosting
```

`firebase.json` rewrites every path back to `/index.html` so the hash router works even if someone deep-links to `https://your-app.web.app/foo`. The `.firebaserc` defaults to project alias `frenmot`; change it to your own project ID before deploying.

For other hosts, just upload everything in the project root **except** `firebase.json`, `.firebaserc`, and the `.git` directory. There's nothing to build.

---

## Privacy & security

- **No backend.** There is no Frenmot server. Your data never leaves your device except for the AI calls you initiate (which go directly to your chosen provider with your own key).
- **No telemetry, no analytics, no cookies, no tracking.**
- **No third-party SDKs** beyond Google Fonts (typography) and PDF.js (PDF parsing). Both are loaded from public CDNs and receive no personal data.
- **API keys are scrubbed from logs.** Any console output that goes through the AI service runs through a `sanitize()` helper that redacts patterns matching OpenAI / Gemini / Groq / NVIDIA keys and `Bearer` tokens.
- **XSS-safe rendering.** The `el()` DOM helper escapes text by default. Only the markdown-lite renderer for chat messages writes `innerHTML`, and that pipeline runs every untrusted string through `escapeHtml()` first before applying basic formatting.
- **CSP-friendly.** No inline `eval`, no `Function` constructors at runtime, no remote-loaded JavaScript beyond the explicit PDF.js script tag.

The full [privacy policy](privacy.html) and [terms of service](tos.html) are deployed alongside the app.

---

## Roadmap

- **PWA manifest + service worker** so the app installs on phones and works fully offline.
- **More irregular verbs** in the offline conjugation dictionary (currently 20 of the most common).
- **More UI languages** beyond English / French — the `t()` infrastructure already supports it; just add a new dictionary block in `i18n.js`.
- **Audio examples** for vocabulary cards (record once via TTS and cache the audio).

---

## License

[MIT](LICENSE). Fork it, ship it, learn from it, change it — all of the above are encouraged.

---

Made by [Justin D'Costa](https://github.com/JustinDcosta). If you build something on top of this, I'd love to hear about it.
