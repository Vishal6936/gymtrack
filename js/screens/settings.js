/* Settings — grouped list with drill-down pages instead of one long screen.
 * Exercise library: muscle groups → exercises → exercise detail. */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, ACCENTS, applyAccent, sheet, toast, confirm, prompt, fmtDate } = GT.ui;
  const S = GT.store;

  let page = 'root'; let muscle = null; let exId = null;

  function render(root, params) {
    if (params && params.open) { page = params.open; params.open = null; }
    const titles = { root: 'Settings', profile: 'Profile & units', look: 'Appearance', timer: 'Timer & sounds', library: 'Exercise library', muscle: muscle || '', exercise: exId ? S.ex(exId).name : '', data: 'Backup & restore' };
    const backTo = { root: null, profile: 'root', look: 'root', timer: 'root', library: 'root', muscle: 'library', exercise: 'muscle', data: 'root' };
    root.append(h('header.top', [
      h('button.icon-btn.glass', { onclick: () => { if (backTo[page]) { page = backTo[page]; GT.app.rerender(); } else GT.app.back(); }, 'aria-label': 'Back' }, icon('left')),
      h('div.grow', [h('p.eyebrow', page === 'root' ? 'GymTrack' : 'Settings'), h('h1', titles[page])])
    ]));
    ({ root: home, profile, look, timer, library, muscle: musclePage, exercise: exercisePage, data })[page](root);
  }
  const go = (p) => { page = p; GT.app.rerender(); document.getElementById('view').scrollTop = 0; };
  const row = (ic, title, sub, onclick) => h('button.set-row', { onclick }, [h('span.set-ico', icon(ic, 18)), h('div.grow', [h('strong', title), sub ? h('small.muted.block', sub) : null]), icon('right', 18)]);
  const toggle = (label, sub, key) => h('label.toggle-row', [h('input', { type: 'checkbox', checked: !!S.s.settings[key], onchange: (e) => { S.s.settings[key] = e.target.checked; S.save(); } }), h('span.switch'), h('div', [h('span', label), sub ? h('small.muted.block', sub) : null])]);

  function home(root) {
    const st = S.s.settings; const nEx = Object.keys(S.s.exercises).length;
    root.append(
      h('div.card.glass.list', [
        row('body', 'Profile & units', `${st.unit} · ${st.dist}${st.height ? ' · ' + st.height + ' cm' : ''}`, () => go('profile')),
        row('bolt', 'Appearance', st.theme === 'custom' ? `Custom · ${st.accent} & ${st.highlight}` : (GT.ui.THEMES[st.theme] || GT.ui.THEMES['pearl-gold']).name, () => go('look')),
        row('timer', 'Timer & sounds', `Sound ${st.sound ? 'on' : 'off'} · vibration ${st.vibrate ? 'on' : 'off'}`, () => go('timer')),
        row('list', 'Exercise library', `${nEx} exercises · ${S.s.muscles.length} muscle groups`, () => go('library')),
        row('download', 'Backup & restore', st.lastBackup ? `Last backup ${fmtDate(S.dateKey(new Date(st.lastBackup)))}` : 'No backup yet', () => go('data'))
      ]),
      h('p.muted.small.pad.center', 'GymTrack v2 · offline · all data stays on this phone')
    );
  }

  function profile(root) {
    const st = S.s.settings;
    const unitSeg = (key, opts, onChange) => h('div.seg', opts.map(([v, l]) => h('button' + (st[key] === v ? '.on' : ''), { onclick: () => { if (st[key] !== v) onChange(v); } }, l)));
    root.append(h('div.card.glass', [
      h('label.field-label', 'Weight unit'),
      unitSeg('unit', [['kg', 'Kilograms'], ['lbs', 'Pounds']], async (v) => {
        // v1 never converted old logs; v2 offers to.
        const conv = await confirm(`Switch to ${v}? Convert all logged weights and body weight too?`, 'Convert everything');
        const f = v === 'lbs' ? 2.20462 : 1 / 2.20462;
        if (conv) {
          Object.values(S.s.workouts).forEach((w) => w.entries.forEach((e) => e.sets.forEach((s2) => { if (s2.w !== '') s2.w = +(Number(s2.w) * f).toFixed(1); })));
          Object.values(S.s.body.logs).forEach((l) => { if (l.Weight !== undefined) l.Weight = +(l.Weight * f).toFixed(1); });
          if (S.s.body.goals.Weight) S.s.body.goals.Weight = +(S.s.body.goals.Weight * f).toFixed(1);
          st.progression = v === 'lbs' ? 5 : 2.5;
        }
        st.unit = v; S.save(); GT.app.rerender(); toast(conv ? 'Converted' : `Unit set to ${v}`);
      }),
      h('label.field-label', 'Measurement unit'),
      unitSeg('dist', [['cm', 'Centimetres'], ['in', 'Inches']], async (v) => {
        const conv = await confirm(`Switch to ${v}? Convert past body measurements too?`, 'Convert');
        if (conv) { const f = v === 'in' ? 1 / 2.54 : 2.54; Object.values(S.s.body.logs).forEach((l) => Object.keys(l).forEach((p) => { if (p !== 'Weight') l[p] = +(l[p] * f).toFixed(1); })); Object.keys(S.s.body.goals).forEach((p) => { if (p !== 'Weight') S.s.body.goals[p] = +(S.s.body.goals[p] * f).toFixed(1); }); }
        st.dist = v; S.save(); GT.app.rerender();
      }),
      h('label.field-label', `Progression increment (${st.unit})`),
      h('input.field.mono', { type: 'number', inputmode: 'decimal', step: '0.5', value: st.progression, onchange: (e) => { st.progression = Math.max(0.25, Number(e.target.value) || 2.5); S.save(); } }),
      h('small.muted', 'Used for the ± buttons and the “Try +x” suggestion when you hit all your reps.'),
      h('label.field-label', 'Height (cm)'),
      h('input.field.mono', { type: 'number', inputmode: 'numeric', value: st.height ?? '', placeholder: 'optional', onchange: (e) => { st.height = e.target.value ? Number(e.target.value) : null; S.save(); } })
    ]));
  }

  // Appearance: pick a curated theme, or Custom = any accent + any of 10 second tones.
  function look(root) {
    const st = S.s.settings; const custom = st.theme === 'custom';
    const set = (patch) => { Object.assign(st, patch); GT.ui.applyTheme(st); S.save(); GT.ui.haptic(10); GT.app.rerender(); };
    root.append(
      h('div.card.glass', [
        h('label.field-label', 'Theme'),
        h('div.themes', [
          ...Object.entries(GT.ui.THEMES).map(([k, t]) => h('button.theme' + (st.theme === k ? '.on' : ''), { style: { '--ta': t.a, '--tb': t.b }, onclick: () => set({ theme: k }) }, [h('i'), h('span', t.name)])),
          h('button.theme.custom' + (custom ? '.on' : ''), { style: { '--ta': ACCENTS[st.accent] || ACCENTS.pearl, '--tb': GT.ui.HIGHLIGHTS[st.highlight] || GT.ui.HIGHLIGHTS.gold }, onclick: () => set({ theme: 'custom' }) }, [h('i'), h('span', 'Custom')])
        ])
      ]),
      custom ? h('div.card.glass', [
        h('label.field-label', 'Accent'),
        h('div.dots-pick', Object.entries(ACCENTS).map(([k, c]) => h('button' + (st.accent === k ? '.on' : ''), { style: { '--sw': c }, onclick: () => set({ accent: k }), 'aria-label': k }, h('span', k)))),
        h('label.field-label', 'Second tone'),
        h('div.dots-pick', Object.entries(GT.ui.HIGHLIGHTS).map(([k, c]) => h('button' + (st.highlight === k ? '.on' : ''), { style: { '--sw': c }, onclick: () => set({ highlight: k }), 'aria-label': k }, h('span', k))))
      ]) : null
    );
  }

  function timer(root) {
    const st = S.s.settings;
    root.append(h('div.card.glass', [
      toggle('Sound', 'Beep when a phase or timer ends', 'sound'),
      toggle('Vibration', 'Haptics on taps and timer alerts', 'vibrate'),
      toggle('Keep screen awake', 'While a timer is running', 'keepAwake'),
      h('button.btn.ghost.wide', { onclick: () => GT.app.go('plan', { section: 'timers' }) }, [icon('timer', 16), 'Edit timer sessions'])
    ]));
  }

  // ---------- exercise library: muscle → exercises → detail ----------
  function library(root) {
    const counts = {}; Object.values(S.s.exercises).forEach((e) => { counts[e.muscle] = (counts[e.muscle] || 0) + 1; });
    root.append(
      h('div.card.glass.list', S.s.muscles.map((m) => h('button.set-row', { style: { '--m': muscleColor(m) }, onclick: () => { muscle = m; go('muscle'); } }, [h('i.mdot'), h('div.grow', [h('strong', m), h('small.muted.block', `${counts[m] || 0} exercises`)]), icon('right', 18)]))),
      h('button.btn.ghost.wide', { onclick: async () => { const n = await prompt('New muscle group', '', 'e.g. Glutes'); if (!n) return; if (S.s.muscles.some((m) => m.toLowerCase() === n.toLowerCase())) return toast('Already exists', 'error'); S.s.muscles.push(n); S.save(); GT.app.rerender(); } }, [icon('plus', 18), 'Add muscle group'])
    );
  }
  function musclePage(root) {
    const list = Object.values(S.s.exercises).filter((e) => e.muscle === muscle).sort((a, b) => a.name.localeCompare(b.name));
    root.append(
      h('div.card.glass.list', list.length ? list.map((e) => { const n = S.history(e.id).length; return h('button.set-row', { onclick: () => { exId = e.id; go('exercise'); } }, [h('div.grow', [h('strong', e.name), h('small.muted.block', n ? `${n} sessions` : 'never logged')]), icon('right', 18)]); }) : h('p.muted', 'No exercises in this group yet.')),
      h('button.btn.ghost.wide', { onclick: async () => { const n = await prompt(`New ${muscle} exercise`); if (!n) return; S.ensureExercise(n, muscle); S.save(); GT.app.rerender(); } }, [icon('plus', 18), 'Add exercise']),
      !list.length && !['Chest', 'Back', 'Legs', 'Other'].includes(muscle) ? h('button.btn.ghost.wide.danger', { onclick: () => { S.s.muscles = S.s.muscles.filter((m) => m !== muscle); S.save(); go('library'); } }, 'Remove empty group') : null
    );
  }
  function exercisePage(root) {
    const ex = S.ex(exId); const hist = S.history(exId); const pr = S.prFor(exId);
    const usedIn = S.DAYS.filter((d) => S.s.plan[d].items.some((i) => i.exId === exId));
    const swaps = S.swapMemory(exId);
    root.append(
      h('div.card.glass', [
        h('div.grid3', [mini(String(hist.length), 'sessions'), mini(pr ? GT.ui.fmtW(pr.maxW.v) : '—', `max ${S.s.settings.unit}`), mini(pr ? GT.ui.fmtW(pr.best1rm.v) : '—', 'e1RM')]),
        usedIn.length ? h('p.small', ['In plan: ', h('strong', usedIn.join(', '))]) : h('p.muted.small', 'Not in your weekly plan.'),
        swaps.length ? h('p.small', ['Usually swapped with: ', h('strong', swaps.slice(0, 3).map(([id, n]) => `${S.ex(id).name} (${n}×)`).join(', '))]) : null
      ]),
      h('div.card.glass.list', [
        row('edit', 'Rename', 'Keeps all history', async () => { const n = await prompt('Rename exercise', ex.name); if (!n) return; ex.name = n; S.save(); GT.app.rerender(); }),
        row('swap', 'Move to another muscle group', ex.muscle, () => { const sh = sheet('Move to…', S.s.muscles.map((m) => h('button.option', { onclick: () => { ex.muscle = m; muscle = m; S.save(); sh.close(); GT.app.rerender(); } }, [h('i.dot', { style: { background: muscleColor(m) } }), h('strong', m)]))); }),
        row('trash', 'Delete exercise', hist.length ? 'Has logged history — can only be renamed' : 'Never logged', async () => {
          // Exercises with history stay so past workouts keep their names.
          if (hist.length) return toast('This exercise has logged history — rename it instead', 'error');
          if (usedIn.length) return toast(`Remove it from ${usedIn.join(', ')} first`, 'error');
          if (!(await confirm(`Delete ${ex.name} from the library?`, 'Delete', true))) return;
          delete S.s.exercises[exId]; S.save(); toast('Deleted'); go('muscle');
        })
      ])
    );
  }
  const mini = (v, l) => h('div.mini-stat', [h('strong.mono', v), h('small', l)]);

  // ---------- backup ----------
  function data(root) {
    const st = S.s.settings;
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; restore(await f.text()); } });
    const ta = h('textarea.field.mono.small', { rows: 5, placeholder: 'Or paste a GymTrack backup (v1 or v2) here…' });
    root.append(
      h('div.card.glass', [
        h('p.small', 'Your data lives only on this phone. Export a copy regularly — it is your only backup.'),
        h('button.btn.primary.wide', { onclick: exportFile }, [icon('download', 18), 'Export backup']),
        h('small.muted.block.center', st.lastBackup ? `Last export ${new Date(st.lastBackup).toLocaleString('en-IN')}` : 'Never exported'),
        h('label.field-label', 'Remind me every'),
        h('div.chips', [3, 7, 14, 30].map((d) => h('button.chip' + (st.backupEveryDays === d ? '.on' : ''), { onclick: () => { st.backupEveryDays = d; S.save(); GT.app.rerender(); } }, `${d} days`)))
      ]),
      h('div.card.glass', [
        h('h3', 'Restore'), h('p.muted.small', 'Works with backups from this app and from the old GymTrack (v1). Restoring replaces what is here now.'),
        fileIn, h('button.btn.ghost.wide', { onclick: () => fileIn.click() }, [icon('upload', 18), 'Import from file']),
        ta, h('button.btn.ghost.wide', { onclick: () => { if (ta.value.trim()) restore(ta.value.trim()); } }, 'Import pasted text')
      ]),
      h('div.card.glass', [h('h3', 'Danger zone'), h('button.btn.ghost.wide.danger', { onclick: async () => { if (!(await confirm('Erase all workouts, measurements and settings, and start fresh with the default plan?', 'Erase everything', true))) return; S.reset(); GT.app.go('today'); toast('Reset complete'); } }, [icon('trash', 16), 'Reset app data'])])
    );
  }
  async function restore(text) {
    if (!(await confirm('Replace everything on this phone with this backup?', 'Restore', true))) return;
    try { S.importAny(text); GT.ui.applyTheme(S.s.settings); toast(`Restored · ${Object.keys(S.s.workouts).length} workout days`); page = 'root'; GT.app.go('today'); }
    catch (e) { toast('That file is not a GymTrack backup', 'error'); }
  }
  async function exportFile() {
    const json = S.exportJSON(); const name = `gymtrack-backup-${S.todayKey()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      // Android share sheet (Drive, WhatsApp, Files…) when available, else download
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'GymTrack backup' });
      else { const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); a.remove(); }
      S.s.settings.lastBackup = Date.now(); S.save(); GT.app.rerender(); toast('Backup exported');
    } catch (e) { if (e && e.name !== 'AbortError') toast('Export failed', 'error'); }
  }

  GT.settings = { render };
})();
