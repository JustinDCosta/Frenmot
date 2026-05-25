/* =================================================================
   Learn — Practice modes hub: Flashcards (with SRS grading),
   Multiple-choice quiz, Type the translation, Listen and choose,
   Conjugation practice, Weak-words review, AI-generated quiz.
   ================================================================= */
(function (global) {
  'use strict';
  const { $, $$, el, escapeHtml, icons, toast, modal, formatInterval, speak } = global.U;

  function langTtsCode() {
    const t = global.State.S.settings.targetLang;
    return ({ fr:'fr-FR', es:'es-ES', de:'de-DE', it:'it-IT', pt:'pt-PT', ja:'ja-JP', ko:'ko-KR', zh:'zh-CN' })[t] || 'en-US';
  }

  function pickQueue(filter, limit = 50) {
    const all = global.State.S.vocab;
    if (filter === 'due')      return global.SRS.getDueWords(all, limit);
    if (filter === 'weak')     return global.SRS.getWeakWords(all).slice(0, limit);
    if (filter === 'new')      return global.SRS.getNewWords(all, limit);
    if (filter === 'mastered') return all.filter(w => (w.srs?.status || 'new') === 'mastered').slice(0, limit);
    return global.U.shuffle(all).slice(0, limit);
  }

  const Learn = {
    /** Hub view: card per practice mode */
    renderView(container, params = {}) {
      container.innerHTML = '';
      const wrap = el('section', { class: 'view' });

      // Header
      const header = el('div', { class:'view-header' });
      header.appendChild(el('div', { class:'flex-1' },
        el('h1', {}, 'Practice'),
        el('p', { class:'subtitle muted' }, 'Train recall, recognition, listening, and conjugation.')
      ));
      wrap.appendChild(header);

      const summary = global.SRS.summary(global.State.S.vocab);

      // Stat strip
      const stats = el('div', { class:'stat-grid mb-20' });
      [
        ['Total words', summary.total, icons.book],
        ['Due now',     summary.due, icons.target],
        ['Mastered',    summary.mastered, icons.star],
        ['Accuracy',    summary.accuracy + '%', icons.sparkle]
      ].forEach(([label, value, ic]) => {
        stats.appendChild(el('div', { class:'stat-card' },
          el('div', { class:'stat-icon', html: ic }),
          el('div', { class:'stat-label' }, label),
          el('div', { class:'stat-value' }, String(value))
        ));
      });
      wrap.appendChild(stats);

      const grid = el('div', { class:'stat-grid' });
      const modes = [
        { id:'flashcards', title:'Flashcards', desc:'Flip and grade. Drives the SRS scheduler.', icon: icons.book, filter:'due' },
        { id:'quiz',       title:'Multiple choice', desc:'Pick the right translation from 4 options.', icon: icons.target, filter:'all' },
        { id:'typing',     title:'Type the translation', desc:'Recall the answer from memory.', icon: icons.edit, filter:'all' },
        { id:'listen',     title:'Listen & choose', desc:'Hear the word and pick the right meaning.', icon: icons.speaker, filter:'all' },
        { id:'conjugation',title:'Conjugation drill', desc:'Practice verb forms.', icon: icons.bot, filter:'all' },
        { id:'weak',       title:'Weak words review', desc:'Focus on words you struggle with most.', icon: icons.flame, filter:'weak' }
      ];
      modes.forEach(m => {
        const card = el('button', {
          class:'stat-card card-hover',
          style:{ textAlign:'left', cursor:'pointer' },
          onclick: () => Learn.start(m.id, { filter: m.filter })
        });
        card.appendChild(el('div', { class:'stat-icon', html: m.icon }));
        card.appendChild(el('div', { class:'stat-label' }, m.title));
        card.appendChild(el('div', { style:{ marginTop:'4px', color:'var(--text-muted)', fontSize:'13px' } }, m.desc));
        grid.appendChild(card);
      });
      wrap.appendChild(grid);

      container.appendChild(wrap);

      if (params.mode) {
        // auto-start a session if user passed ?mode=...
        Learn.start(params.mode, { filter: params.filter || 'due' });
      }
    },

    /** Start a session — opens a modal-shaped UI taking over main */
    start(mode, opts = {}) {
      const queue = pickQueue(opts.filter || 'due', 30);
      if (!queue.length) {
        toast('No words available for this mode yet.', 'warning');
        return;
      }
      const main = document.getElementById('main');
      main.innerHTML = '';
      const session = el('section', { class:'view practice-shell' });

      // Top bar
      const top = el('div', { class:'row-between', style:{ width:'100%', maxWidth:'540px' } });
      const back = el('button', { class:'btn btn-ghost' });
      back.innerHTML = '← Back';
      back.addEventListener('click', () => { window.location.hash = '#/learn'; });
      const counter = el('div', { class:'muted text-sm' });
      const title = el('div', { class:'eyebrow' }, modeTitle(mode));
      top.appendChild(back);
      top.appendChild(title);
      top.appendChild(counter);
      session.appendChild(top);

      const stage = el('div', { class:'col gap-16', style:{ width:'100%', alignItems:'center' } });
      session.appendChild(stage);
      main.appendChild(session);

      let i = 0;
      let correct = 0, attempted = 0;

      function next() {
        if (i >= queue.length) { showSummary(); return; }
        counter.textContent = `${i + 1} / ${queue.length}`;
        stage.innerHTML = '';
        const w = queue[i];
        if (mode === 'flashcards' || mode === 'weak') stage.appendChild(renderFlashcard(w, onResult));
        else if (mode === 'quiz') stage.appendChild(renderQuiz(w, queue, onResult));
        else if (mode === 'typing') stage.appendChild(renderTyping(w, onResult));
        else if (mode === 'listen') stage.appendChild(renderListen(w, queue, onResult));
        else if (mode === 'conjugation') stage.appendChild(renderConjugation(w, onResult));
        else stage.appendChild(renderFlashcard(w, onResult));
      }
      function onResult({ grade, correct: ok }) {
        attempted++;
        if (ok || grade >= 2) correct++;
        // update SRS
        global.State.update(s => {
          const word = s.vocab.find(x => x.id === queue[i].id);
          if (word) global.SRS.applyGrade(word, grade ?? (ok ? 2 : 0), s.settings.srs);
        });
        global.SRS.recordReviewActivity(grade ?? (ok ? 2 : 0));
        i++; setTimeout(next, 250);
      }

      function showSummary() {
        stage.innerHTML = '';
        const card = el('div', { class:'card card-pad-lg', style:{ width:'100%', maxWidth:'540px', textAlign:'center' } });
        card.appendChild(el('div', { class:'eyebrow', style:{ marginBottom:'8px' } }, 'Session complete'));
        card.appendChild(el('h2', { style:{ fontFamily:'Fraunces, serif', fontSize:'2rem' } }, `${correct} / ${attempted} correct`));
        card.appendChild(el('p', { class:'muted' }, attempted ? `${Math.round(correct/attempted*100)}% accuracy` : ''));
        const row = el('div', { class:'row gap-8', style:{ justifyContent:'center', marginTop:'14px' } });
        const again = el('button', { class:'btn btn-primary' }, 'Practice more');
        again.addEventListener('click', () => Learn.start(mode, opts));
        const home = el('button', { class:'btn btn-outline' }, 'Back to practice');
        home.addEventListener('click', () => window.location.hash = '#/learn');
        row.appendChild(again); row.appendChild(home);
        card.appendChild(row);
        stage.appendChild(card);
      }
      next();
    }
  };

  function modeTitle(m) {
    return ({
      flashcards:'Flashcards', quiz:'Multiple choice', typing:'Typing recall',
      listen:'Listen & choose', conjugation:'Conjugation drill', weak:'Weak words'
    })[m] || 'Practice';
  }

  /* ---------- Flashcards ---------- */
  function renderFlashcard(w, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%' } });
    const card = el('div', { class:'flashcard' });
    const inner = el('div', { class:'flashcard-inner' });
    const front = el('div', { class:'flashcard-face' });
    front.appendChild(el('div', { class:'eyebrow' }, 'Word'));
    front.appendChild(el('div', { class:'flashcard-word' }, w.source || ''));
    if (w.pos) front.appendChild(el('div', { class:'badge' }, w.pos));
    front.appendChild(el('div', { class:'flashcard-hint' }, 'Tap card to reveal translation'));
    const back = el('div', { class:'flashcard-face back' });
    back.appendChild(el('div', { class:'eyebrow' }, 'Translation'));
    back.appendChild(el('div', { class:'flashcard-word' }, w.target || '—'));
    if (w.definition) back.appendChild(el('div', { class:'muted', style:{ fontSize:'13.5px', maxWidth:'90%' } }, w.definition));
    if (w.example) back.appendChild(el('div', { style:{ fontStyle:'italic', fontSize:'13px', color:'var(--text-muted)', maxWidth:'90%' } }, '“' + w.example + '”'));
    inner.appendChild(front); inner.appendChild(back);
    card.appendChild(inner);
    card.addEventListener('click', () => card.classList.toggle('flipped'));
    wrap.appendChild(card);

    const speakBtn = el('button', { class:'btn btn-ghost' });
    speakBtn.innerHTML = icons.speaker + '<span>Pronounce</span>';
    speakBtn.addEventListener('click', () => speak(w.source, langTtsCode()));
    wrap.appendChild(speakBtn);

    // confidence buttons
    const settings = global.State.S.settings.srs;
    const intervals = [0, 1, 2, 3].map(g => global.SRS.predictInterval(w.srs, g, settings));
    const labels = ['Again', 'Hard', 'Good', 'Easy'];
    const row = el('div', { class:'confidence-row' });
    [0, 1, 2, 3].forEach(g => {
      const b = el('button', { class:'confidence-btn', dataset:{ grade: String(g) } });
      b.appendChild(el('div', { class:'label-strong' }, labels[g]));
      b.appendChild(el('div', { class:'interval' }, formatInterval(intervals[g])));
      b.addEventListener('click', () => done({ grade: g, correct: g >= 2 }));
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }

  /* ---------- Multiple choice ---------- */
  function renderQuiz(w, all, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%' } });
    wrap.appendChild(el('div', { class:'eyebrow' }, 'Choose the right translation'));
    wrap.appendChild(el('div', { class:'flashcard-word', style:{ fontSize:'2rem' } }, w.source || ''));

    const distractors = global.U.shuffle(all.filter(x => x.id !== w.id && x.target)).slice(0, 3);
    const options = global.U.shuffle([w, ...distractors]);

    const grid = el('div', { class:'quiz-options' });
    options.forEach((opt, i) => {
      const b = el('button', { class:'quiz-option' });
      b.appendChild(el('span', { class:'marker' }, String.fromCharCode(65 + i)));
      b.appendChild(el('span', {}, opt.target || '—'));
      b.addEventListener('click', () => {
        if (opt.id === w.id) {
          b.classList.add('correct');
          setTimeout(() => done({ grade: 2, correct: true }), 350);
        } else {
          b.classList.add('wrong');
          // reveal correct answer
          grid.querySelectorAll('.quiz-option').forEach((el2, j) => {
            if (options[j].id === w.id) el2.classList.add('correct');
          });
          setTimeout(() => done({ grade: 0, correct: false }), 700);
        }
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  /* ---------- Typing ---------- */
  function renderTyping(w, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%', maxWidth:'540px' } });
    wrap.appendChild(el('div', { class:'eyebrow' }, 'Type the translation'));
    wrap.appendChild(el('div', { class:'flashcard-word', style:{ fontSize:'2rem' } }, w.source || ''));
    const input = el('input', { type:'text', placeholder:'Your answer…', style:{ fontSize:'16px' } });
    wrap.appendChild(input);
    const fb = el('div', { class:'text-sm muted' });
    wrap.appendChild(fb);
    const submit = el('button', { class:'btn btn-primary' }, 'Check');
    submit.addEventListener('click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    wrap.appendChild(submit);

    function normalize(s) {
      return (s || '').toLowerCase().trim()
        .replace(/[.,!?;:'"]/g, '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function check() {
      const ans = normalize(input.value);
      const correct = (w.target || '').split(/[,/]/).map(s => normalize(s));
      const ok = correct.includes(ans) || correct.some(c => c && (ans.includes(c) || c.includes(ans)));
      if (ok) {
        fb.textContent = '✓ Correct';
        fb.style.color = 'var(--success)';
        setTimeout(() => done({ grade: 2, correct: true }), 600);
      } else {
        fb.textContent = `Answer: ${w.target}`;
        fb.style.color = 'var(--danger)';
        setTimeout(() => done({ grade: 0, correct: false }), 1200);
      }
    }
    setTimeout(() => input.focus(), 50);
    return wrap;
  }

  /* ---------- Listen and choose ---------- */
  function renderListen(w, all, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%' } });
    wrap.appendChild(el('div', { class:'eyebrow' }, 'Listen and choose'));

    const playBtn = el('button', { class:'btn btn-primary btn-lg' });
    playBtn.innerHTML = icons.speaker + '<span>Play sound</span>';
    playBtn.addEventListener('click', () => speak(w.source, langTtsCode()));
    wrap.appendChild(playBtn);
    setTimeout(() => speak(w.source, langTtsCode()), 250);

    const distractors = global.U.shuffle(all.filter(x => x.id !== w.id && x.target)).slice(0, 3);
    const options = global.U.shuffle([w, ...distractors]);
    const grid = el('div', { class:'quiz-options' });
    options.forEach((opt, i) => {
      const b = el('button', { class:'quiz-option' });
      b.appendChild(el('span', { class:'marker' }, String.fromCharCode(65 + i)));
      b.appendChild(el('span', {}, opt.target || '—'));
      b.addEventListener('click', () => {
        if (opt.id === w.id) { b.classList.add('correct'); setTimeout(() => done({ grade: 2, correct: true }), 350); }
        else { b.classList.add('wrong'); setTimeout(() => done({ grade: 0, correct: false }), 600); }
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  /* ---------- Conjugation drill ---------- */
  function renderConjugation(w, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%', maxWidth:'540px' } });
    wrap.appendChild(el('div', { class:'eyebrow' }, 'Conjugation'));
    const isVerb = (w.pos || '').toLowerCase() === 'verb' || /e[r]$|i[r]$|re$/.test(w.source || '');

    if (!isVerb) {
      // skip non-verbs: present a flashcard for that word instead
      wrap.appendChild(el('div', { class:'flashcard-word' }, w.source));
      wrap.appendChild(el('div', { class:'muted text-sm' }, 'This isn’t a verb — just review.'));
      const skip = el('button', { class:'btn btn-primary' }, 'Continue');
      skip.addEventListener('click', () => done({ grade: 2, correct: true }));
      wrap.appendChild(skip);
      return wrap;
    }

    wrap.appendChild(el('div', { class:'flashcard-word', style:{ fontSize:'1.6rem' } }, w.source));
    if (w.conjugation) {
      wrap.appendChild(el('div', { class:'muted text-sm' }, 'Reference: ' + w.conjugation));
    } else {
      wrap.appendChild(el('div', { class:'muted text-sm' }, 'Type the conjugation for a chosen pronoun.'));
    }
    const pronoun = el('select', {});
    ['je','tu','il/elle','nous','vous','ils/elles'].forEach(p => pronoun.appendChild(el('option', { value: p }, p)));
    wrap.appendChild(pronoun);
    const input = el('input', { type:'text', placeholder:'Your conjugation…' });
    wrap.appendChild(input);
    const fb = el('div', { class:'text-sm muted' });
    wrap.appendChild(fb);
    const row = el('div', { class:'row gap-8' });
    const skipBtn = el('button', { class:'btn btn-ghost' }, "I don't know");
    skipBtn.addEventListener('click', () => done({ grade: 0, correct: false }));
    const checkBtn = el('button', { class:'btn btn-primary' }, 'Check');
    checkBtn.addEventListener('click', () => {
      const ans = (input.value || '').trim();
      if (!ans) return;
      // Without an offline conjugator the heuristic is: accept if the conjugation field contains it.
      const ref = (w.conjugation || '').toLowerCase();
      const ok = ans.length > 1 && ref.includes(ans.toLowerCase());
      if (ok) { fb.textContent = '✓ Looks right'; fb.style.color = 'var(--success)'; setTimeout(() => done({ grade: 2, correct: true }), 700); }
      else    { fb.textContent = ref ? `Reference: ${w.conjugation}` : 'No reference available — graded as practice.'; fb.style.color = 'var(--text-muted)'; setTimeout(() => done({ grade: 1, correct: false }), 1200); }
    });
    row.appendChild(skipBtn); row.appendChild(checkBtn);
    wrap.appendChild(row);
    return wrap;
  }

  /* ---------- Review view (a focused flashcard session of all due cards) ---------- */
  Learn.renderReviewView = function (container) {
    container.innerHTML = '';
    const due = global.SRS.getDueWords(global.State.S.vocab);
    const total = global.State.S.vocab.length;

    const wrap = el('section', { class: 'view' });
    const header = el('div', { class:'view-header' });
    header.appendChild(el('div', { class:'flex-1' },
      el('h1', {}, 'Review'),
      el('p', { class:'subtitle muted' }, due.length ? `${due.length} word${due.length===1?'':'s'} due now.` : 'Nothing due — great work.')
    ));
    const actions = el('div', { class:'actions' });
    if (due.length) {
      const start = el('button', { class:'btn btn-primary' });
      start.innerHTML = icons.play + '<span>Start review</span>';
      start.addEventListener('click', () => Learn.start('flashcards', { filter: 'due' }));
      actions.appendChild(start);
    }
    header.appendChild(actions);
    wrap.appendChild(header);

    if (!total) {
      wrap.appendChild(emptyVocab());
      container.appendChild(wrap);
      return;
    }

    // Stat strip
    const summary = global.SRS.summary(global.State.S.vocab);
    const stats = el('div', { class:'stat-grid mb-20' });
    [
      ['Due', summary.due, icons.target],
      ['Learning', summary.learning, icons.book],
      ['Mastered', summary.mastered, icons.star],
      ['Streak', global.State.S.review.streak + ' day' + (global.State.S.review.streak === 1 ? '' : 's'), icons.flame]
    ].forEach(([l, v, ic]) => {
      stats.appendChild(el('div', { class:'stat-card' },
        el('div', { class:'stat-icon', html: ic }),
        el('div', { class:'stat-label' }, l),
        el('div', { class:'stat-value' }, String(v))
      ));
    });
    wrap.appendChild(stats);

    if (!due.length) {
      const empty = el('div', { class:'empty-state' });
      empty.innerHTML = `
        <div class="icon-wrap">${icons.check}</div>
        <h3>You’re all caught up</h3>
        <p>Come back later or jump into a practice mode to add more reps.</p>`;
      const row = el('div', { class:'row', style:{ justifyContent:'center' } });
      const learnBtn = el('button', { class:'btn btn-primary' }); learnBtn.innerHTML = icons.play + '<span>Practice anyway</span>';
      learnBtn.addEventListener('click', () => window.location.hash = '#/learn');
      row.appendChild(learnBtn);
      empty.appendChild(row);
      wrap.appendChild(empty);
    } else {
      const card = el('div', { class:'card card-pad-lg', style:{ textAlign:'center' } });
      card.appendChild(el('div', { class:'eyebrow', style:{ marginBottom:'6px' } }, 'Due now'));
      card.appendChild(el('h2', { style:{ fontFamily:'Fraunces, serif', fontSize:'2rem' } }, `${due.length} word${due.length===1?'':'s'} ready for review`));
      card.appendChild(el('p', { class:'muted' }, 'Use confidence buttons to keep your schedule healthy.'));
      const start = el('button', { class:'btn btn-primary btn-lg', style:{ marginTop:'10px' } });
      start.innerHTML = icons.play + '<span>Start review session</span>';
      start.addEventListener('click', () => Learn.start('flashcards', { filter:'due' }));
      card.appendChild(start);
      wrap.appendChild(card);
    }

    container.appendChild(wrap);
  };

  function emptyVocab() {
    const e = el('div', { class:'empty-state' });
    e.innerHTML = `
      <div class="icon-wrap">${icons.book}</div>
      <h3>No words to review yet</h3>
      <p>Add a word, import a list, or upload a PDF to extract vocabulary.</p>`;
    const row = el('div', { class:'row', style:{ justifyContent:'center' } });
    const a = el('button', { class:'btn btn-primary' }); a.innerHTML = icons.plus + '<span>Add word</span>';
    a.addEventListener('click', () => global.Vocab.openWordModal());
    row.appendChild(a);
    e.appendChild(row);
    return e;
  }

  global.Learn = Learn;
})(window);
