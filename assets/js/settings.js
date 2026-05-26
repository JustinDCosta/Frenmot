/* =================================================================
   Settings — Unified module: General, AI, SRS, Reminders, Data tabs.
   ================================================================= */
(function (global) {
  'use strict';
  const { el, icons, toast, modal, confirmModal, maskKey } = global.U;

  let activeTab = 'general';

  /* ---------- Helper ---------- */
  function field(label, input, hint) {
    const wrap = el('label', { class:'field' });
    wrap.appendChild(el('span', { class:'field-label' }, label));
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el('div', { class:'text-xs muted' }, hint));
    return wrap;
  }

  /* ========== GENERAL ========== */
  function renderGeneral() {
    const s = global.State.S;
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' }, el('h2', {}, 'Account & Appearance')));

    const u = s.user || {};
    const profileRow = el('div', { class:'row gap-12 mb-16', style:{ alignItems:'center' } });
    profileRow.appendChild(el('div', { class:'avatar', style:{ width:'56px', height:'56px', fontSize:'18px' } }, global.Auth.initials(u.name)));
    profileRow.appendChild(el('div', { class:'col' },
      el('div', { style:{ fontWeight:700, fontSize:'15px' } }, u.name || 'Guest'),
      el('div', { class:'text-xs muted' }, u.email || 'Local account · stored on this device')
    ));
    card.appendChild(profileRow);

    const nameInput = el('input', { type:'text', value: u.name || '' });
    nameInput.addEventListener('change', () => { global.Auth.update({ name: nameInput.value.trim() || u.name }); toast('Name updated', 'success'); });
    card.appendChild(field('Display name', nameInput));

    const emailInput = el('input', { type:'email', value: u.email || '', placeholder:'you@example.com' });
    emailInput.addEventListener('change', () => global.Auth.update({ email: emailInput.value.trim() }));
    card.appendChild(field('Email (optional)', emailInput));

    const langSelect = el('select', {});
    [['fr','French'],['es','Spanish'],['de','German'],['it','Italian'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese']]
      .forEach(([v,l]) => { const o = el('option', { value: v }, l); if ((s.settings.targetLang || u.targetLang) === v) o.selected = true; langSelect.appendChild(o); });
    langSelect.addEventListener('change', () => { global.State.set('settings.targetLang', langSelect.value); global.Auth.update({ targetLang: langSelect.value }); toast('Language updated', 'success'); });
    card.appendChild(field('Target language', langSelect, 'Used for translations, conjugation, and TTS.'));

    const themeRow = el('div', { class:'segmented mt-12' });
    [['light','Light'],['dark','Dark'],['system','System']].forEach(([v,l]) => {
      const b = el('button', { type:'button', 'aria-pressed': String(s.settings.theme === v) }, l);
      b.addEventListener('click', () => { global.Theme.setMode(v); global.Settings.renderView(document.getElementById('main')); });
      themeRow.appendChild(b);
    });
    card.appendChild(field('Theme', themeRow));

    const accents = ['indigo','rose','emerald','amber','sky','violet'];
    const accentRow = el('div', { class:'row flex-wrap gap-8 mt-8' });
    accents.forEach(a => {
      const sw = el('button', { type:'button', 'aria-label': a, title: a, style: { width:'34px', height:'34px', borderRadius:'10px', background: ({indigo:'#6366f1',rose:'#f43f5e',emerald:'#10b981',amber:'#f59e0b',sky:'#0ea5e9',violet:'#8b5cf6'})[a], border: a === s.settings.accent ? '3px solid var(--text)' : '2px solid var(--border)', cursor:'pointer' } });
      sw.addEventListener('click', () => { global.Theme.setAccent(a); global.Settings.renderView(document.getElementById('main')); });
      accentRow.appendChild(sw);
    });
    card.appendChild(field('Accent color', accentRow));

    const out = el('button', { class:'btn btn-outline mt-20', style:{ color:'var(--danger)', borderColor:'var(--danger-bg)' } });
    out.innerHTML = icons.lock + '<span>Log out</span>';
    out.addEventListener('click', async () => {
      const ok = await confirmModal({
        title:'Log out?',
        message:'Your data stays on this device.',
        confirmLabel:'Log out',
        danger:true
      });
      if (!ok) return;
      const success = global.Auth.logout();
      if (!success) { toast('Logout failed. Please try again.', 'error'); return; }
      window.location.hash = '#/';
      window.location.reload();
    });
    card.appendChild(out);
    return card;
  }

  /* ========== AI INTEGRATIONS ========== */
  function renderAI() {
    const wrap = el('div', { class:'col gap-12' });
    const top = el('div', { class:'card' });
    top.appendChild(el('div', { class:'section-title' }, el('h2', {}, 'API Integrations'), el('span', { class:'badge' }, 'Bring your own key')));
    top.appendChild(el('p', { class:'muted text-sm' }, 'Connect your AI provider to unlock the chatbot, translations, vocabulary enhancement, and PDF Q&A. Choose a default provider — Frenmot will route requests to it.'));

    const settings = global.State.S.settings;
    const defaultRow = el('div', { class:'row gap-8 mt-12 flex-wrap' });
    defaultRow.appendChild(el('div', { class:'field-label' }, 'Default provider'));
    const defSel = el('select', {});
    defSel.appendChild(el('option', { value: '' }, '— None selected —'));
    global.AIProviders.list.forEach(id => { const def = global.AIProviders.byId(id); const o = el('option', { value: id }, def.name); if (settings.defaultProvider === id) o.selected = true; defSel.appendChild(o); });
    defSel.addEventListener('change', () => { global.AI.setDefault(defSel.value || null); toast(defSel.value ? 'Default set to ' + global.AIProviders.byId(defSel.value).name : 'Default cleared', 'success'); global.Settings.renderView(document.getElementById('main')); });
    defaultRow.appendChild(defSel);
    top.appendChild(defaultRow);

    top.appendChild(el('div', { class:'card mt-12 card-pad-sm', style:{ background:'var(--info-bg)', border:'1px solid transparent' } },
      el('div', { class:'row gap-8', style:{ alignItems:'flex-start' } },
        el('span', { class:'icon-btn', html: icons.lock, style:{ width:'30px', height:'30px', color:'var(--info)' } }),
        el('div', { class:'flex-1 col gap-4' },
          el('div', { style:{ fontWeight:700 } }, 'About key storage'),
          el('div', { class:'text-sm muted' }, 'Your API key is stored only on this device, lightly obfuscated in browser storage. Frenmot never sends your key to a Frenmot server. For maximum security, configure a server proxy or use a key with spending limits.')
        )
      )
    ));
    wrap.appendChild(top);
    global.AIProviders.list.forEach(id => wrap.appendChild(renderProviderCard(id)));
    wrap.appendChild(renderProxy());
    return wrap;
  }

  function renderProviderCard(id) {
    const def = global.AIProviders.byId(id);
    const settings = global.State.S.settings;
    const cfg = settings.providers[id] || {};
    const hasKey = !!cfg.keyEnc;
    const isDefault = settings.defaultProvider === id;

    const card = el('div', { class: 'provider-card' + (isDefault ? ' active' : '') });
    card.appendChild(el('div', { class:'provider-logo', style:{ background: def.color, color:'#fff' } }, def.initials));
    const info = el('div', { class:'provider-info' });
    info.appendChild(el('h3', {}, def.name, ' ', hasKey ? el('span', { class:'badge badge-success' }, 'Connected') : el('span', { class:'badge' }, 'Not connected'), isDefault ? el('span', { class:'badge badge-accent' }, 'Default') : null));
    info.appendChild(el('p', {}, def.description));

    const keyInput = el('input', { type:'password', placeholder: hasKey ? maskKey(global.U.deobfuscate(cfg.keyEnc)) : def.keyHint + ' key', autocomplete:'off', spellcheck:'false', style:{ fontFamily:'ui-monospace, monospace', fontSize:'13px' } });
    const showBtn = el('button', { class:'icon-btn', type:'button', 'aria-label':'Toggle visibility', html: icons.eye });
    showBtn.addEventListener('click', () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; showBtn.innerHTML = keyInput.type === 'password' ? icons.eye : icons.eyeOff; });
    const keyRow = el('div', { class:'row gap-8 mb-8' }); const keyWrap = el('div', { class:'flex-1' }); keyWrap.appendChild(keyInput); keyRow.appendChild(keyWrap); keyRow.appendChild(showBtn);
    info.appendChild(keyRow);

    const modelSel = el('select', {});
    def.models.forEach(m => { const o = el('option', { value: m }, m); if ((cfg.model || def.defaultModel) === m) o.selected = true; modelSel.appendChild(o); });
    const customOpt = el('option', { value: '__custom__' }, 'Custom…'); modelSel.appendChild(customOpt);
    if (cfg.model && !def.models.includes(cfg.model)) customOpt.selected = true;
    const customModelInput = el('input', { type:'text', placeholder:'Custom model id', value: (cfg.model && !def.models.includes(cfg.model)) ? cfg.model : '' });
    customModelInput.style.display = customOpt.selected ? 'block' : 'none';
    modelSel.addEventListener('change', () => { customModelInput.style.display = modelSel.value === '__custom__' ? 'block' : 'none'; if (modelSel.value !== '__custom__') global.AI.setModel(id, modelSel.value); });
    customModelInput.addEventListener('change', () => global.AI.setModel(id, customModelInput.value.trim() || def.defaultModel));

    const baseInput = el('input', { type:'text', placeholder: def.defaultBaseUrl, value: cfg.baseUrl || '' });
    baseInput.addEventListener('change', () => global.AI.setBaseUrl(id, baseInput.value.trim()));

    info.appendChild(el('div', { class:'row gap-8 mb-8 flex-wrap' },
      el('div', { class:'col flex-1', style:{ minWidth:'180px' } }, el('div', { class:'field-label' }, 'Model'), modelSel, customModelInput),
      el('div', { class:'col flex-1', style:{ minWidth:'200px' } }, el('div', { class:'field-label' }, 'Base URL (optional)'), baseInput)
    ));

    const actions = el('div', { class:'provider-actions' });
    const saveBtn = el('button', { class:'btn btn-primary btn-sm' }, 'Save key');
    saveBtn.addEventListener('click', () => { const v = keyInput.value.trim(); if (!v) { toast('Type a key first.', 'warning'); return; } global.AI.saveKey(id, v); keyInput.value = ''; toast(def.name + ' key saved', 'success'); global.Settings.renderView(document.getElementById('main')); });
    const testBtn = el('button', { class:'btn btn-outline btn-sm' }); testBtn.innerHTML = icons.sparkle + '<span>Test</span>';
    testBtn.addEventListener('click', async () => { testBtn.disabled = true; testBtn.innerHTML = '<span class="spinner"></span>'; const r = await global.AI.testProvider(id); testBtn.disabled = false; testBtn.innerHTML = icons.sparkle + '<span>Test</span>'; toast(r.message, r.ok ? 'success' : 'error'); });
    const defaultBtn = el('button', { class:'btn btn-secondary btn-sm' }, isDefault ? 'Default ✓' : 'Set default');
    if (!isDefault) defaultBtn.addEventListener('click', () => { global.AI.setDefault(id); toast(def.name + ' is now default', 'success'); global.Settings.renderView(document.getElementById('main')); });
    const removeBtn = el('button', { class:'btn btn-ghost btn-sm', style:{ color:'var(--danger)' } }); removeBtn.innerHTML = icons.trash + '<span>Remove</span>'; removeBtn.disabled = !hasKey;
    removeBtn.addEventListener('click', () => { global.AI.saveKey(id, ''); if (settings.defaultProvider === id) global.AI.setDefault(null); toast('Key removed', 'success'); global.Settings.renderView(document.getElementById('main')); });
    const docs = el('a', { class:'text-sm', href: def.docs, target:'_blank', rel:'noopener noreferrer' }, 'Get a key →');
    actions.appendChild(saveBtn); actions.appendChild(testBtn); actions.appendChild(defaultBtn); actions.appendChild(removeBtn); actions.appendChild(docs);
    info.appendChild(actions);
    card.appendChild(info);
    return card;
  }

  function renderProxy() {
    const cfg = global.State.S.settings.proxy || { enabled: false, url: '' };
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' }, el('h2', {}, 'Server proxy (advanced)'), el('span', { class:'badge' }, 'optional')));
    card.appendChild(el('p', { class:'muted text-sm' }, 'Point Frenmot at a proxy that holds your key on a server. Frenmot will POST {provider, model, messages, temperature} and expect {content} JSON back.'));
    const enable = el('label', { class:'switch' }); const cb = el('input', { type:'checkbox' }); cb.checked = !!cfg.enabled; cb.addEventListener('change', () => global.State.set('settings.proxy.enabled', cb.checked)); enable.appendChild(cb); enable.appendChild(el('div', { class:'track' }));
    card.appendChild(el('div', { class:'row gap-8 mt-8', style:{ alignItems:'center' } }, enable, el('div', {}, 'Use proxy when available')));
    const urlInput = el('input', { type:'url', placeholder:'https://your-proxy.example.com/api/chat', value: cfg.url || '' });
    urlInput.addEventListener('change', () => global.State.set('settings.proxy.url', urlInput.value.trim()));
    card.appendChild(field('Proxy URL', urlInput));
    return card;
  }

  /* ========== SRS ========== */
  function renderSRS() {
    const srs = global.State.S.settings.srs;
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' }, el('h2', {}, 'Spaced Repetition')));
    card.appendChild(el('p', { class:'muted text-sm' }, 'Customize how Frenmot schedules reviews. The "Good" ladder controls interval growth.'));

    const intervalsInput = el('input', { type:'text', value: (srs.intervals || []).join(', '), placeholder:'1, 3, 7, 14, 30, 60' });
    intervalsInput.addEventListener('change', () => { const arr = intervalsInput.value.split(',').map(s => Math.max(0, Number(s.trim()) || 0)).filter(n => n > 0); if (!arr.length) { toast('Need at least one positive number.', 'error'); return; } global.State.set('settings.srs.intervals', arr); toast('Schedule updated', 'success'); });
    card.appendChild(field('"Good" ladder (days)', intervalsInput, 'Comma-separated. E.g. 1, 3, 7, 14, 30, 60.'));

    const newPerDayInput = el('input', { type:'number', min:'0', max:'500', value: String(srs.newPerDay || 20) });
    newPerDayInput.addEventListener('change', () => global.State.set('settings.srs.newPerDay', Math.max(0, Number(newPerDayInput.value) || 0)));
    card.appendChild(field('New cards per day', newPerDayInput));

    const easyInput = el('input', { type:'number', step:'0.05', min:'1', max:'2', value: String(srs.easyBonus || 1.3) });
    easyInput.addEventListener('change', () => global.State.set('settings.srs.easyBonus', Number(easyInput.value)));
    card.appendChild(field('Easy bonus multiplier', easyInput));

    const hardInput = el('input', { type:'number', step:'0.05', min:'0.1', max:'1', value: String(srs.hardPenalty || 0.6) });
    hardInput.addEventListener('change', () => global.State.set('settings.srs.hardPenalty', Number(hardInput.value)));
    card.appendChild(field('Hard penalty multiplier', hardInput));

    const presets = el('div', { class:'row gap-8 flex-wrap mt-12' });
    [['Default',[1,3,7,14,30,60]],['Aggressive',[1,2,4,8,16,32]],['Gentle',[1,4,10,21,45,90]]].forEach(([label, arr]) => {
      const b = el('button', { class:'btn btn-ghost btn-sm' }, label);
      b.addEventListener('click', () => { global.State.set('settings.srs.intervals', arr); toast(label + ' schedule applied', 'success'); global.Settings.renderView(document.getElementById('main')); });
      presets.appendChild(b);
    });
    card.appendChild(field('Presets', presets));
    return card;
  }

  /* ========== REMINDERS ========== */
  function renderReminders() {
    const r = global.State.S.settings.reminders;
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' }, el('h2', {}, 'Daily Reminders')));
    if (!global.Notifications.isSupported()) card.appendChild(el('p', { class:'muted text-sm' }, 'This browser does not support native notifications. In-app banners will be used instead.'));

    const enable = el('label', { class:'switch' }); const cb = el('input', { type:'checkbox' }); cb.checked = !!r.enabled;
    cb.addEventListener('change', async () => {
      if (cb.checked && global.Notifications.permission() === 'default') { const res = await global.Notifications.requestPermission(); if (res === 'denied') toast("Notifications blocked — we'll use in-app banners.", 'warning', 5000); }
      global.Notifications.setEnabled(cb.checked); toast(cb.checked ? 'Reminders enabled' : 'Reminders disabled', 'success'); global.Settings.renderView(document.getElementById('main'));
    });
    enable.appendChild(cb); enable.appendChild(el('div', { class:'track' }));
    card.appendChild(el('div', { class:'row gap-12 mt-8', style:{ alignItems:'center' } }, enable, el('div', {}, 'Enable daily reminder')));

    const timeInput = el('input', { type:'time', value: r.time || '19:00' }); timeInput.disabled = !r.enabled;
    timeInput.addEventListener('change', () => global.Notifications.setTime(timeInput.value));
    card.appendChild(field('Reminder time', timeInput));

    const missedSwitch = el('label', { class:'switch' }); const mcb = el('input', { type:'checkbox' }); mcb.checked = !!r.notifyMissed;
    mcb.addEventListener('change', () => global.State.set('settings.reminders.notifyMissed', mcb.checked));
    missedSwitch.appendChild(mcb); missedSwitch.appendChild(el('div', { class:'track' }));
    card.appendChild(el('div', { class:'row gap-12 mt-8', style:{ alignItems:'center' } }, missedSwitch, el('div', {}, "Notify if I missed yesterday's review")));

    const test = el('button', { class:'btn btn-outline mt-12' }); test.innerHTML = icons.bell + '<span>Send test reminder</span>';
    test.addEventListener('click', () => global.Notifications.fireNow());
    card.appendChild(test);
    return card;
  }

  /* ========== DATA ========== */
  function renderData() {
    const card = el('div', { class:'card' });
    card.appendChild(el('div', { class:'section-title' }, el('h2', {}, 'Data')));
    card.appendChild(el('p', { class:'muted text-sm' }, 'All your data lives in this browser. Export to back up or move to another device.'));

    const exportBtn = el('button', { class:'btn btn-primary' }); exportBtn.innerHTML = icons.download + '<span>Export everything</span>';
    exportBtn.addEventListener('click', () => { const data = global.State.exportJSON(); const blob = new Blob([data], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = el('a', { href: url, download: 'frenmot-backup-' + new Date().toISOString().slice(0,10) + '.json' }); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast('Backup exported', 'success'); });

    const importBtn = el('button', { class:'btn btn-outline' }); importBtn.innerHTML = icons.upload + '<span>Import backup</span>';
    importBtn.addEventListener('click', () => { const input = el('input', { type:'file', accept:'application/json' }); input.addEventListener('change', async () => { const f = input.files && input.files[0]; if (!f) return; try { const text = await f.text(); global.State.importJSON(text); toast('Backup imported. Reloading…', 'success'); setTimeout(() => window.location.reload(), 600); } catch (e) { toast(e.message, 'error'); } }); input.click(); });

    const resetBtn = el('button', { class:'btn btn-ghost', style:{ color:'var(--danger)' } }); resetBtn.innerHTML = icons.trash + '<span>Reset all data</span>';
    resetBtn.addEventListener('click', async () => { const ok = await confirmModal({ title:'Reset all data?', message:'This deletes vocabulary, PDFs, settings, AI keys, and review history. Cannot be undone.', confirmLabel:'Reset', danger:true }); if (ok) { global.State.reset(); toast('All data reset', 'success'); setTimeout(() => window.location.reload(), 600); } });

    card.appendChild(el('div', { class:'row gap-8 flex-wrap mt-8' }, exportBtn, importBtn, resetBtn));
    return card;
  }

  /* ========== MAIN RENDER ========== */
  const Settings = {
    _tab: activeTab,
    renderView(container) {
      container.innerHTML = '';
      const wrap = el('section', { class:'view' });
      const header = el('div', { class:'view-header' });
      header.appendChild(el('div', { class:'flex-1' }, el('h1', {}, 'Settings'), el('p', { class:'subtitle muted' }, 'Customize Frenmot to your taste, connect AI, and manage your data.')));
      wrap.appendChild(header);

      const tabs = el('div', { class:'segmented mb-20' });
      [['general','General'],['ai','AI Integrations'],['srs','Spaced Repetition'],['reminders','Reminders'],['data','Data']].forEach(([id, label]) => {
        const b = el('button', { type:'button', 'aria-pressed': String(id === activeTab) }, label);
        b.addEventListener('click', () => { activeTab = id; Settings.renderView(container); });
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);

      const panel = el('div', { class:'col gap-16' });
      if (activeTab === 'general')   panel.appendChild(renderGeneral());
      if (activeTab === 'ai')        panel.appendChild(renderAI());
      if (activeTab === 'srs')       panel.appendChild(renderSRS());
      if (activeTab === 'reminders') panel.appendChild(renderReminders());
      if (activeTab === 'data')      panel.appendChild(renderData());
      wrap.appendChild(panel);
      container.appendChild(wrap);
    }
  };

  global.Settings = Settings;
})(window);
