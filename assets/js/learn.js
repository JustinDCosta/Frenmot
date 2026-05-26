/* =================================================================
   Learn — Practice modes hub: Flashcards (with SRS grading),
   Multiple-choice quiz, Type the translation, Listen and choose,
   Conjugation practice, Weak-words review, AI-generated quiz.
   ================================================================= */
(function (global) {
  'use strict';
  const { el, icons, toast, formatInterval, speak } = global.U;

  function langTtsCode() {
    const tl = global.State.S.settings.targetLang;
    return ({ fr:'fr-FR', es:'es-ES', de:'de-DE', it:'it-IT', pt:'pt-PT', ja:'ja-JP', ko:'ko-KR', zh:'zh-CN' })[tl] || 'en-US';
  }

  function isVerb(w) {
    if (!w) return false;
    const pos = (w.pos || '').toLowerCase();
    if (pos === 'verb' || pos === 'verbe') return true;
    // Suffix heuristic for legacy data without explicit pos.
    const src = (w.source || '').toLowerCase().trim();
    return /(?:er|ir|re|oir)$/.test(src);
  }

  function pickQueue(filter, limit = 50, opts = {}) {
    const all = global.State.S.vocab;
    let pool = all;

    // Conjugation Drill: strictly verbs. Prefer pos === 'verb' tagging;
    // fall back to suffix heuristic only if no tagged verbs exist.
    if (opts.requireVerbs) {
      const tagged = all.filter(w => (w.pos || '').toLowerCase() === 'verb');
      pool = tagged.length ? tagged : all.filter(isVerb);
    }

    if (filter === 'due')      return global.SRS.getDueWords(pool, limit);
    if (filter === 'weak')     return global.SRS.getWeakWords(pool).slice(0, limit);
    if (filter === 'new')      return global.SRS.getNewWords(pool, limit);
    if (filter === 'mastered') return pool.filter(w => (w.srs?.status || 'new') === 'mastered').slice(0, limit);
    return global.U.shuffle(pool).slice(0, limit);
  }

  const Learn = {
    /** Hub view: card per practice mode */
    renderView(container, params = {}) {
      container.innerHTML = '';
      const wrap = el('section', { class: 'view' });

      const header = el('div', { class:'view-header' });
      header.appendChild(el('div', { class:'flex-1' },
        el('h1', {}, t('practice.title')),
        el('p', { class:'subtitle muted' }, t('practice.subtitle'))
      ));
      wrap.appendChild(header);

      const summary = global.SRS.summary(global.State.S.vocab);

      const stats = el('div', { class:'stat-grid mb-20' });
      [
        [t('dashboard.totalWords'), summary.total, icons.book],
        [t('vocab.dueNow'),         summary.due,   icons.target],
        [t('dashboard.mastered'),   summary.mastered, icons.star],
        [t('dashboard.accuracy'),   summary.accuracy + '%', icons.sparkle]
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
        { id:'flashcards',  title: t('practice.flashcards'),   desc: t('practice.flashcardsDesc'),  icon: icons.book,    filter:'due' },
        { id:'quiz',        title: t('practice.quiz'),         desc: t('practice.quizDesc'),        icon: icons.target,  filter:'all' },
        { id:'typing',      title: t('practice.typing'),       desc: t('practice.typingDesc'),      icon: icons.edit,    filter:'all' },
        { id:'listen',      title: t('practice.listen'),       desc: t('practice.listenDesc'),      icon: icons.speaker, filter:'all' },
        { id:'conjugation', title: t('practice.conjugation'),  desc: t('practice.conjugationDesc'), icon: icons.bot,     filter:'all' },
        { id:'weak',        title: t('practice.weak'),         desc: t('practice.weakDesc'),        icon: icons.flame,   filter:'weak' }
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
        Learn.start(params.mode, { filter: params.filter || 'due' });
      }
    },

    /** Start a practice session — takes over #main */
    start(mode, opts = {}) {
      const requireVerbs = (mode === 'conjugation');
      const queue = pickQueue(opts.filter || 'due', 30, { requireVerbs });
      if (!queue.length) {
        if (requireVerbs) { showConjugationEmpty(); return; }
        toast(t('practice.noWords'), 'warning');
        return;
      }
      const main = document.getElementById('main');
      main.innerHTML = '';
      const session = el('section', { class:'view practice-shell' });

      const top = el('div', { class:'row-between', style:{ width:'100%', maxWidth:'540px' } });
      const back = el('button', { class:'btn btn-ghost' });
      back.innerHTML = '← <span>' + global.U.escapeHtml(t('practice.back')) + '</span>';
      back.addEventListener('click', (e) => {
        e.preventDefault();
        // Use App.navigateTo so even when the hash is already #/learn we
        // still re-render the practice hub (otherwise hashchange doesn't fire).
        global.App.navigateTo('learn');
      });
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
        card.appendChild(el('div', { class:'eyebrow', style:{ marginBottom:'8px' } }, t('practice.complete')));
        card.appendChild(el('h2', { style:{ fontFamily:'Fraunces, serif', fontSize:'2rem' } }, `${correct} / ${attempted} correct`));
        card.appendChild(el('p', { class:'muted' }, attempted ? `${Math.round(correct/attempted*100)}% accuracy` : ''));
        const row = el('div', { class:'row gap-8', style:{ justifyContent:'center', marginTop:'14px' } });
        const again = el('button', { class:'btn btn-primary' }, t('practice.practiceMore'));
        again.addEventListener('click', () => Learn.start(mode, opts));
        const home = el('button', { class:'btn btn-outline' }, t('practice.backToPractice'));
        home.addEventListener('click', (e) => {
          e.preventDefault();
          global.App.navigateTo('learn');
        });
        row.appendChild(again); row.appendChild(home);
        card.appendChild(row);
        stage.appendChild(card);
      }
      next();
    }
  };

  function modeTitle(m) {
    return ({
      flashcards:  t('practice.flashcards'),
      quiz:        t('practice.quiz'),
      typing:      t('practice.typing'),
      listen:      t('practice.listen'),
      conjugation: t('practice.conjugation'),
      weak:        t('practice.weak')
    })[m] || t('practice.title');
  }

  /** Helpful empty state when conjugation drill has no verbs available. */
  function showConjugationEmpty() {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = '';
    const wrap = el('section', { class: 'view' });

    const header = el('div', { class:'view-header' });
    const back = el('button', { class:'btn btn-ghost' });
    back.innerHTML = '← <span>' + global.U.escapeHtml(t('practice.back')) + '</span>';
    back.addEventListener('click', (e) => { e.preventDefault(); global.App.navigateTo('learn'); });
    header.appendChild(back);
    wrap.appendChild(header);

    const empty = el('div', { class:'empty-state' });
    empty.innerHTML = `<div class="icon-wrap">${icons.bot}</div>
      <h3>${global.U.escapeHtml(t('practice.conjugation.empty'))}</h3>
      <p>${global.U.escapeHtml(t('practice.conjugation.emptyHint'))}</p>`;
    const row = el('div', { class:'row gap-8', style:{ justifyContent:'center' } });
    const open = el('a', { class:'btn btn-primary', href:'#/conjugation' });
    open.innerHTML = icons.search + '<span>' + global.U.escapeHtml(t('nav.conjugation')) + '</span>';
    const addWord = el('button', { class:'btn btn-outline' });
    addWord.innerHTML = icons.plus + '<span>' + global.U.escapeHtml(t('vocab.addNew')) + '</span>';
    addWord.addEventListener('click', () => global.Vocab.openWordModal());
    row.appendChild(open); row.appendChild(addWord);
    empty.appendChild(row);
    wrap.appendChild(empty);
    main.appendChild(wrap);
  }

  /* ---------- Flashcards ---------- */
  function renderFlashcard(w, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%' } });
    const card = el('div', { class:'flashcard' });
    const inner = el('div', { class:'flashcard-inner' });
    const front = el('div', { class:'flashcard-face' });
    front.appendChild(el('div', { class:'eyebrow' }, t('vocab.field.word')));
    front.appendChild(el('div', { class:'flashcard-word' }, w.source || ''));
    if (w.pos) front.appendChild(el('div', { class:'badge' }, w.pos));
    front.appendChild(el('div', { class:'flashcard-hint' }, 'Tap card to reveal translation'));
    const back = el('div', { class:'flashcard-face back' });
    back.appendChild(el('div', { class:'eyebrow' }, t('vocab.field.translation')));
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
    wrap.appendChild(el('div', { class:'eyebrow' }, t('practice.choose')));
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
    wrap.appendChild(el('div', { class:'eyebrow' }, t('practice.typeAnswer')));
    wrap.appendChild(el('div', { class:'flashcard-word', style:{ fontSize:'2rem' } }, w.source || ''));
    const input = el('input', { type:'text', placeholder: t('practice.yourAnswer'), style:{ fontSize:'16px' }, class:'accent-aware' });
    wrap.appendChild(input);
    const fb = el('div', { class:'text-sm muted' });
    wrap.appendChild(fb);
    const submit = el('button', { class:'btn btn-primary' }, t('practice.check'));
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
        fb.textContent = t('practice.correct');
        fb.style.color = 'var(--success)';
        setTimeout(() => done({ grade: 2, correct: true }), 600);
      } else {
        fb.textContent = `${t('practice.answerWas')} ${w.target}`;
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
    wrap.appendChild(el('div', { class:'eyebrow' }, t('practice.listenChoose')));

    const playBtn = el('button', { class:'btn btn-primary btn-lg' });
    playBtn.innerHTML = icons.speaker + '<span>' + global.U.escapeHtml(t('practice.playSound')) + '</span>';
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

  /* ---------- Conjugation drill ----------
     Queue is pre-filtered to verbs only by pickQueue. We try the offline
     conjugator first to get authoritative reference forms; if unavailable
     we fall back to the user's free-text conjugation field. */
  function renderConjugation(w, done) {
    const wrap = el('div', { class:'col gap-12', style:{ alignItems:'center', width:'100%', maxWidth:'540px' } });
    wrap.appendChild(el('div', { class:'eyebrow' }, t('practice.conjugation.title')));
    wrap.appendChild(el('div', { class:'flashcard-word', style:{ fontSize:'1.6rem' } }, w.source));

    const refLine = el('div', { class:'muted text-sm' });
    wrap.appendChild(refLine);

    let conjData = null;
    if (global.Conjugation && global.Conjugation.lookup) {
      global.Conjugation.lookup(w.source).then(r => {
        if (r) {
          conjData = r;
          const present = (r.tenses?.present || []).slice(0,3).join(', ');
          refLine.textContent = present ? 'Présent : ' + present : (w.conjugation || '');
        } else if (w.conjugation) {
          refLine.textContent = 'Reference: ' + w.conjugation;
        }
      }).catch(() => {
        if (w.conjugation) refLine.textContent = 'Reference: ' + w.conjugation;
      });
    } else if (w.conjugation) {
      refLine.textContent = 'Reference: ' + w.conjugation;
    }

    const pronoun = el('select', {});
    ['je','tu','il/elle','nous','vous','ils/elles'].forEach(p => pronoun.appendChild(el('option', { value: p }, p)));
    wrap.appendChild(pronoun);
    const input = el('input', { type:'text', placeholder:'Your conjugation…', class:'accent-aware' });
    wrap.appendChild(input);
    const fb = el('div', { class:'text-sm muted' });
    wrap.appendChild(fb);
    const row = el('div', { class:'row gap-8' });
    const skipBtn = el('button', { class:'btn btn-ghost' }, t('practice.conjugation.dontKnow'));
    skipBtn.addEventListener('click', () => done({ grade: 0, correct: false }));
    const checkBtn = el('button', { class:'btn btn-primary' }, t('practice.check'));
    checkBtn.addEventListener('click', () => {
      const ans = (input.value || '').trim().toLowerCase();
      if (!ans) return;
      let ok = false;
      if (conjData && conjData.tenses) {
        const idx = ['je','tu','il/elle','nous','vous','ils/elles'].indexOf(pronoun.value);
        const ref = (conjData.tenses.present?.[idx] || '').toLowerCase();
        ok = ref && ref.includes(ans);
        if (!ok) {
          ok = Object.values(conjData.tenses).some(forms =>
            Array.isArray(forms) && forms.some(f => (f || '').toLowerCase().includes(ans))
          );
        }
        if (ok) {
          fb.textContent = '✓ Correct'; fb.style.color = 'var(--success)';
          setTimeout(() => done({ grade: 2, correct: true }), 700);
          return;
        }
        fb.textContent = 'Reference: ' + ref; fb.style.color = 'var(--danger)';
        setTimeout(() => done({ grade: 0, correct: false }), 1300);
        return;
      }
      const ref = (w.conjugation || '').toLowerCase();
      ok = ans.length > 1 && ref.includes(ans);
      if (ok) { fb.textContent = '✓ Looks right'; fb.style.color = 'var(--success)'; setTimeout(() => done({ grade: 2, correct: true }), 700); }
      else    { fb.textContent = ref ? 'Reference: ' + w.conjugation : 'No reference available — graded as practice.'; fb.style.color = 'var(--text-muted)'; setTimeout(() => done({ grade: 1, correct: false }), 1200); }
    });
    row.appendChild(skipBtn); row.appendChild(checkBtn);
    wrap.appendChild(row);
    return wrap;
  }

  /* ---------- Review view ---------- */
  Learn.renderReviewView = function (container) {
    container.innerHTML = '';
    const due = global.SRS.getDueWords(global.State.S.vocab);
    const total = global.State.S.vocab.length;

    const wrap = el('section', { class: 'view' });
    const header = el('div', { class:'view-header' });
    header.appendChild(el('div', { class:'flex-1' },
      el('h1', {}, t('review.title')),
      el('p', { class:'subtitle muted' }, due.length ? t('review.dueLine', { n: due.length }) : t('review.allCaught'))
    ));
    const actions = el('div', { class:'actions' });
    if (due.length) {
      const start = el('button', { class:'btn btn-primary' });
      start.innerHTML = icons.play + '<span>' + global.U.escapeHtml(t('review.startReview')) + '</span>';
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

    const summary = global.SRS.summary(global.State.S.vocab);
    const stats = el('div', { class:'stat-grid mb-20' });
    [
      [t('vocab.dueNow'), summary.due, icons.target],
      [t('vocab.learning'), summary.learning, icons.book],
      [t('dashboard.mastered'), summary.mastered, icons.star],
      [t('dashboard.streak'), t('common.days', { n: global.State.S.review.streak }), icons.flame]
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
        <h3>${global.U.escapeHtml(t('review.allCaughtTitle'))}</h3>
        <p>${global.U.escapeHtml(t('review.allCaughtBody'))}</p>`;
      const row = el('div', { class:'row', style:{ justifyContent:'center' } });
      const learnBtn = el('button', { class:'btn btn-primary' });
      learnBtn.innerHTML = icons.play + '<span>' + global.U.escapeHtml(t('review.practiceAnyway')) + '</span>';
      learnBtn.addEventListener('click', () => global.App.navigateTo('learn'));
      row.appendChild(learnBtn);
      empty.appendChild(row);
      wrap.appendChild(empty);
    } else {
      const card = el('div', { class:'card card-pad-lg', style:{ textAlign:'center' } });
      card.appendChild(el('div', { class:'eyebrow', style:{ marginBottom:'6px' } }, t('vocab.dueNow')));
      card.appendChild(el('h2', { style:{ fontFamily:'Fraunces, serif', fontSize:'2rem' } },
        t('review.dueLine', { n: due.length })));
      card.appendChild(el('p', { class:'muted' }, 'Use confidence buttons to keep your schedule healthy.'));
      const start = el('button', { class:'btn btn-primary btn-lg', style:{ marginTop:'10px' } });
      start.innerHTML = icons.play + '<span>' + global.U.escapeHtml(t('review.startSession')) + '</span>';
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
      <h3>${global.U.escapeHtml(t('review.empty.title'))}</h3>
      <p>${global.U.escapeHtml(t('review.empty.body'))}</p>`;
    const row = el('div', { class:'row', style:{ justifyContent:'center' } });
    const a = el('button', { class:'btn btn-primary' });
    a.innerHTML = icons.plus + '<span>' + global.U.escapeHtml(t('vocab.addWord')) + '</span>';
    a.addEventListener('click', () => global.Vocab.openWordModal());
    row.appendChild(a);
    e.appendChild(row);
    return e;
  }

  global.Learn = Learn;
})(window);
