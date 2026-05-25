/* =================================================================
   Dashboard — overview of progress, streaks, and quick actions.
   ================================================================= */
(function (global) {
  'use strict';
  const { el, icons, formatDate, formatRelative } = global.U;

  const Dashboard = {
    renderView(container) {
      container.innerHTML = '';
      const s = global.State.S;
      const wrap = el('section', { class: 'view' });

      // Header
      const greeting = greet(s.user?.name);
      const header = el('div', { class:'view-header' });
      header.appendChild(el('div', { class:'flex-1' },
        el('div', { class:'eyebrow' }, todayLabel()),
        el('h1', { class:'font-display' }, greeting),
        el('p', { class:'subtitle muted' }, motivationLine(s))
      ));
      const actions = el('div', { class:'actions' });
      const start = el('a', { class:'btn btn-primary', href:'#/review' });
      start.innerHTML = icons.play + '<span>Start review</span>';
      const add = el('button', { class:'btn btn-outline' });
      add.innerHTML = icons.plus + '<span>Add word</span>';
      add.addEventListener('click', () => global.Vocab.openWordModal());
      actions.appendChild(start);
      actions.appendChild(add);
      header.appendChild(actions);
      wrap.appendChild(header);

      // Stat grid
      const summary = global.SRS.summary(s.vocab);
      const stats = el('div', { class:'stat-grid mb-20' });
      const items = [
        { label:'Total words',    value: summary.total,     icon: icons.book },
        { label:'Due today',      value: summary.due,       icon: icons.target },
        { label:'Mastered',       value: summary.mastered,  icon: icons.star },
        { label:'Weak',           value: summary.weak,      icon: icons.flame },
        { label:'Streak',         value: `${s.review.streak} day${s.review.streak === 1 ? '' : 's'}`, icon: icons.flame },
        { label:'Accuracy',       value: `${summary.accuracy}%`, icon: icons.sparkle }
      ];
      items.forEach(it => {
        const card = el('div', { class:'stat-card' });
        card.appendChild(el('div', { class:'stat-icon', html: it.icon }));
        card.appendChild(el('div', { class:'stat-label' }, it.label));
        card.appendChild(el('div', { class:'stat-value' }, String(it.value)));
        stats.appendChild(card);
      });
      wrap.appendChild(stats);

      // Two-column row: weekly progress + AI status / PDFs
      const row = el('div', { class:'stat-grid', style:{ gridTemplateColumns:'2fr 1fr', gap:'14px' } });
      row.appendChild(buildWeeklyCard());
      row.appendChild(buildAICard());
      wrap.appendChild(row);

      // Recent activity grid
      const row2 = el('div', { class:'stat-grid mt-16', style:{ gridTemplateColumns:'1fr 1fr', gap:'14px' } });
      row2.appendChild(buildRecentVocabCard());
      row2.appendChild(buildRecentPdfsCard());
      wrap.appendChild(row2);

      // Mobile: collapse 2-col rows by widening grid
      if (window.innerWidth < 720) {
        row.style.gridTemplateColumns = '1fr';
        row2.style.gridTemplateColumns = '1fr';
      }

      container.appendChild(wrap);
    }
  };

  function greet(name) {
    const h = new Date().getHours();
    const greet = h < 5 ? 'Bonsoir' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    return `${greet}${name ? ', ' + name : ''}`;
  }
  function todayLabel() {
    return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function motivationLine(s) {
    const due = global.SRS.summary(s.vocab).due;
    if (due === 0) return 'Nothing due — great time to add new vocabulary or chat with the tutor.';
    if (due < 5)   return `${due} words ready for review. A quick session keeps the streak alive.`;
    if (due < 20)  return `${due} words due. Settle in for a focused round.`;
    return `${due} due — let's whittle them down together.`;
  }

  function buildWeeklyCard() {
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' },
      el('h2', {}, 'Weekly progress'),
      el('span', { class:'badge' }, 'last 7 days')
    ));

    const wh = global.State.S.stats.weekHistory;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = global.U.todayKey(d);
      const entry = wh.find(e => e.day === key);
      days.push({ key, date: d, entry });
    }
    const max = Math.max(1, ...days.map(d => (d.entry?.reviewed || 0)));

    const chart = el('div', { class:'row', style:{ alignItems:'flex-end', gap:'8px', height:'140px', marginTop:'4px' } });
    days.forEach(d => {
      const v = d.entry?.reviewed || 0;
      const h = Math.max(4, Math.round((v / max) * 110));
      const col = el('div', { class:'col', style:{ alignItems:'center', gap:'6px', flex:'1' } });
      const bar = el('div', {
        title: `${v} reviews`,
        style: {
          width: '100%', height: `${h}px`,
          borderRadius: '8px',
          background: v ? 'linear-gradient(180deg, var(--accent-500), var(--accent-700))' : 'var(--surface-2)'
        }
      });
      col.appendChild(bar);
      col.appendChild(el('div', { class:'text-xs muted' }, d.date.toLocaleDateString(undefined, { weekday:'short' })));
      chart.appendChild(col);
    });
    card.appendChild(chart);

    const total = days.reduce((acc, d) => acc + (d.entry?.reviewed || 0), 0);
    const correct = days.reduce((acc, d) => acc + (d.entry?.correct || 0), 0);
    const added = days.reduce((acc, d) => acc + (d.entry?.added || 0), 0);
    const stats = el('div', { class:'row gap-16 mt-12' });
    stats.appendChild(el('div', { class:'col' },
      el('div', { class:'text-xs muted' }, 'Reviews'),
      el('div', { style:{ fontWeight:700, fontSize:'18px' } }, String(total))
    ));
    stats.appendChild(el('div', { class:'col' },
      el('div', { class:'text-xs muted' }, 'Accuracy'),
      el('div', { style:{ fontWeight:700, fontSize:'18px' } }, total ? `${Math.round(correct/total*100)}%` : '—')
    ));
    stats.appendChild(el('div', { class:'col' },
      el('div', { class:'text-xs muted' }, 'New words'),
      el('div', { style:{ fontWeight:700, fontSize:'18px' } }, String(added))
    ));
    card.appendChild(stats);
    return card;
  }

  function buildAICard() {
    const card = el('div', { class:'card' });
    const active = global.AI.getActive();
    card.appendChild(el('div', { class:'section-title' },
      el('h2', {}, 'AI status'),
      el('span', { class:`badge ${active ? 'badge-success' : 'badge-warning'}` }, active ? 'Connected' : 'Not connected')
    ));
    if (active) {
      card.appendChild(el('div', { class:'row gap-8 mb-8' },
        el('div', { class:'provider-logo', style:{ width:'36px', height:'36px', borderRadius:'8px' } }, active.def.initials),
        el('div', { class:'col' },
          el('div', { style:{ fontWeight:700 } }, active.def.name),
          el('div', { class:'text-xs muted' }, active.model)
        )
      ));
      const row = el('div', { class:'row gap-8' });
      const a = el('a', { class:'btn btn-secondary btn-sm', href:'#/chat' });
      a.innerHTML = global.U.icons.chat + '<span>Open tutor</span>';
      const b = el('a', { class:'btn btn-outline btn-sm', href:'#/settings' }, 'Manage');
      row.appendChild(a); row.appendChild(b);
      card.appendChild(row);
    } else {
      card.appendChild(el('p', { class:'muted text-sm' }, 'Connect an OpenAI, Gemini, Groq, or NVIDIA key to unlock AI features: chat tutor, translations, vocabulary enhancement, and PDF Q&A.'));
      const a = el('a', { class:'btn btn-primary btn-sm', href:'#/settings' });
      a.innerHTML = global.U.icons.settings + '<span>Connect provider</span>';
      card.appendChild(a);
    }
    return card;
  }

  function buildRecentVocabCard() {
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' },
      el('h2', {}, 'Recently added'),
      el('a', { class:'text-sm', href:'#/vocabulary' }, 'View all')
    ));
    const recent = (global.State.S.vocab || []).slice(0, 5);
    if (!recent.length) {
      card.appendChild(el('p', { class:'muted text-sm' }, 'No words yet.'));
      return card;
    }
    const list = el('div', { class:'col gap-8' });
    recent.forEach(w => {
      const row = el('a', { class:'row card card-pad-sm card-hover', href:'#/vocabulary', style:{ alignItems:'center', gap:'10px' } });
      row.appendChild(el('div', { class:'flex-1' },
        el('div', { style:{ fontWeight:700 } }, w.source || ''),
        el('div', { class:'text-xs muted' }, w.target || '')
      ));
      row.appendChild(el('span', { class:'badge' }, w.srs?.status || 'new'));
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  function buildRecentPdfsCard() {
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' },
      el('h2', {}, 'PDFs'),
      el('a', { class:'text-sm', href:'#/pdf' }, 'Open library')
    ));
    const pdfs = (global.State.S.pdfs || []).slice(0, 5);
    if (!pdfs.length) {
      card.appendChild(el('p', { class:'muted text-sm' }, 'No documents yet — upload a PDF to learn from it.'));
      const a = el('a', { class:'btn btn-secondary btn-sm', href:'#/pdf' });
      a.innerHTML = global.U.icons.upload + '<span>Upload PDF</span>';
      card.appendChild(a);
      return card;
    }
    const list = el('div', { class:'col gap-8' });
    pdfs.forEach(d => {
      const row = el('a', { class:'row card card-pad-sm card-hover', href:'#/pdf', style:{ alignItems:'center', gap:'10px' } });
      row.appendChild(el('span', { class:'icon-btn', html: global.U.icons.file, style:{ width:'30px', height:'30px' } }));
      row.appendChild(el('div', { class:'flex-1', style:{ minWidth:0 } },
        el('div', { style:{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, d.name),
        el('div', { class:'text-xs muted' }, `${d.pages} pages · ${global.U.formatRelative(d.addedAt)}`)
      ));
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  global.Dashboard = Dashboard;
})(window);
