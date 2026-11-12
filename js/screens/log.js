/* =====================================================================
 * Log — the heart of the app.
 * Two views of the same workout:
 *   • Overview: collapsible cards, one open at a time (as in v1)
 *   • Focus: one exercise full-screen, swipe left/right between exercises
 * Everything autosaves; "Finish" stamps duration and shows a summary.
 * ===================================================================== */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, fmtW, fmtDate, fmtNum, haptic, toast, sheet, confirm } = GT.ui;
  const S = GT.store;

  let openUid = null;        // which overview card is expanded
  let mode = 'overview';     // 'overview' | 'focus'
  let focusIdx = 0;
  let root = null;
  let reorder = false;      // long-press a card to drag exercises into a new order

  const unit = () => S.s.settings.unit;

  // Saves (instantly — see store.save) and flashes a quiet "Saved" tick at the top.
  let savedTimer = null;
  function save() {
    S.save();
    const el = document.getElementById('savedpill'); if (!el) return;
    el.classList.add('show'); clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('show'), 1100);
  }
  const W = () => S.ensureWorkout(GT.app.logDate);

  // ---------- render ----------
  function render(el) {
    root = el;
    const date = GT.app.logDate; const t = S.todayKey();
    const w = W(); S.save(); // silent: just opening a day isn't an edit
    const { done, total } = S.plannedDoneCount(date);
    const allSets = w.entries.reduce((a, e) => a + e.sets.length, 0);
    const doneSets = w.entries.reduce((a, e) => a + S.doneSets(e).length, 0); // sets of ticked exercises
    if (!openUid || !w.entries.some((e) => e.uid === openUid)) openUid = (w.entries.find((e) => !S.entryComplete(e)) || {}).uid || null;

    // the name stored at swap time, so renaming a plan day later doesn't rewrite this
    const srcLine = w.source.type === 'plan' ? S.dayLabel(date) : `${S.weekday(date)} swapped with ${w.source.type === 'routine' ? w.source.label : `${w.source.day} · ${w.source.name || w.source.label}`}`;

    el.append(
      h('header.top', [
        h('div', [h('p.eyebrow', date === t ? 'Today' : fmtDate(date, { weekday: 'long' })), h('h1', 'Log')]),
        h('span.saved-pill', { id: 'savedpill', 'aria-live': 'polite' }, [icon('check', 13), 'Saved']),
        h('div.seg.mini', [
          h('button' + (mode === 'overview' ? '.on' : ''), { onclick: () => { mode = 'overview'; GT.app.rerender(); }, 'aria-label': 'List view' }, icon('list', 18)),
          h('button' + (mode === 'focus' ? '.on' : ''), { onclick: () => { mode = 'focus'; focusIdx = Math.max(0, w.entries.findIndex((e) => e.uid === openUid)); GT.app.rerender(); }, 'aria-label': 'Focus view' }, icon('focus', 18))
        ])
      ]),
      dateNav(date),
      h('div.card.glass.log-head', [
        h('div.row.between', [h('div', [h('strong', srcLine), h('small.muted.block', `${done}/${total} planned · ${doneSets}/${allSets} sets`)]), w.finishedAt ? h('span.pill.ok', 'Finished') : null]),
        h('div.progress', h('div', { style: { width: (allSets ? (doneSets / allSets) * 100 : 0) + '%' } }))
      ]),
      w.entries.length === 0 ? h('div.empty.card.glass', [icon('cal', 32), h('p', 'Rest day — nothing planned.'), h('p.muted.small', 'Load a workout or add an exercise to train anyway.')]) : null,
      reorder ? h('div.row.between', [h('p.reorder-hint', 'Drag ⋮⋮ to reorder'), h('button.chip.on', { onclick: () => { reorder = false; GT.app.rerender(); } }, 'Done')]) : null,
      mode === 'focus' && w.entries.length && !reorder ? focusView(w) : cardList(w),
      actions(w, date)
    );
  }

  function dateNav(date) {
    const t = S.todayKey();
    return h('div.datenav', [
      h('button.icon-btn', { onclick: () => { GT.app.logDate = S.addDays(date, -1); openUid = null; GT.app.rerender(); }, 'aria-label': 'Previous day' }, icon('left')),
      h('button.datenav-mid', { onclick: () => { GT.app.logDate = t; openUid = null; GT.app.rerender(); } }, [h('strong', fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })), date !== t ? h('small.accent', 'Back to today') : null]),
      h('button.icon-btn', { onclick: () => { GT.app.logDate = S.addDays(date, 1); openUid = null; GT.app.rerender(); }, 'aria-label': 'Next day' }, icon('right'))
    ]);
  }

  function cardList(w) {
    const list = h('div.cards', w.entries.map((e) => card(e)));
    if (reorder) GT.ui.dragSort(list, (from, to) => { const [x] = w.entries.splice(from, 1); w.entries.splice(to, 0, x); save(); });
    return list;
  }

  // ---------- overview card ----------
  function card(e) {
    if (reorder) {
      const ex = S.ex(e.exId);
      return h('article.excard.glass' + (e.done ? '.done' : ''), { 'data-uid': e.uid }, h('div.excard-head', [h('span.drag-handle', icon('drag', 18)), h('div.excard-title', [h('strong', ex.name), h('small.muted', ex.muscle)])]));
    }
    const ex = S.ex(e.exId); const complete = S.entryComplete(e); const open = e.uid === openUid;
    const nd = e.sets.filter(S.setValid).length; // rows with weight + reps filled
    const el = h('article.excard.glass' + (complete ? '.done' : '') + (open ? '.open' : ''), { 'data-uid': e.uid, style: { '--m': muscleColor(ex.muscle) } }, [
      h('div.excard-head', { onclick: () => toggle(e.uid) }, [
        h('i.mbar'),
        h('div.excard-title', [h('strong', ex.name), e.swappedFrom ? h('small.swapped', ['↪ Swapped from ', S.ex(e.swappedFrom).name]) : null]),
        // the n/n count only appears once something is logged
        h('span.setcount.mono', nd ? `${nd}/${e.sets.length}` : ''),
        // hollow ring = untouched, half ring = some sets filled (saved, not counted yet), green = done
        h('button.tick' + (complete ? '.on' : nd ? '.partial' : ''), { onclick: (ev) => { ev.stopPropagation(); toggleAll(e); }, 'aria-label': complete ? 'Mark incomplete' : 'Mark all sets done' }, icon('check', 18))
      ]),
      h('div.excard-body', open ? body(e) : null)
    ]);
    swipeToTick(el.querySelector('.excard-head'), el, e);
    return el;
  }

  // Swipe a card's header to the right to tick/untick it. Holding still on a
  // header for half a second switches to reorder mode.
  function swipeToTick(head, cardEl, e) {
    let x0 = null, y0 = null, dx = 0, lp = null;
    head.addEventListener('touchstart', (ev) => {
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; dx = 0;
      lp = setTimeout(() => { x0 = null; reorder = true; mode = 'overview'; haptic([20, 30, 20]); GT.app.rerender(); }, 550);
    }, { passive: true });
    head.addEventListener('touchmove', (ev) => {
      if (x0 === null) return;
      dx = ev.touches[0].clientX - x0; const dy = ev.touches[0].clientY - y0;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(lp);
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (dx > 0) cardEl.style.transform = `translateX(${Math.min(dx, 110) * 0.6}px)`;
    }, { passive: true });
    head.addEventListener('touchend', () => {
      clearTimeout(lp); if (x0 === null) return; x0 = null;
      cardEl.style.transition = 'transform .3s var(--spring)'; cardEl.style.transform = '';
      if (dx > 80) { head.dataset.swiped = '1'; toggleAll(e); setTimeout(() => delete head.dataset.swiped, 400); }
    });
  }

  function toggle(uid) {
    if (root.querySelector(`.excard[data-uid="${uid}"] .excard-head`)?.dataset.swiped) return; // a swipe isn't a tap
    openUid = openUid === uid ? null : uid;
    haptic(6);
    // swap only the affected cards so the page doesn't jump
    root.querySelectorAll('.excard').forEach((c) => { const e = W().entries.find((x) => x.uid === c.dataset.uid); if (e) c.replaceWith(card(e)); });
    const opened = root.querySelector('.excard.open'); if (opened) setTimeout(() => opened.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }
  function refreshCard(e) {
    const old = root.querySelector(`.excard[data-uid="${e.uid}"]`); if (old) old.replaceWith(card(e));
    // Finish's enabled state depends on whether anything is ticked, so redraw
    // the action area too (this was the "Finish does nothing" bug).
    const act = root.querySelector('.log-actions'); if (act) act.replaceWith(actions(W(), GT.app.logDate));
    const head = root.querySelector('.log-head');
    if (head) { const w = W(); const all = w.entries.reduce((a, x) => a + x.sets.length, 0); const d = w.entries.reduce((a, x) => a + S.doneSets(x).length, 0); head.querySelector('.progress div').style.width = (all ? (d / all) * 100 : 0) + '%'; const { done, total } = S.plannedDoneCount(GT.app.logDate); head.querySelector('small').textContent = `${done}/${total} planned · ${d}/${all} sets`; }
  }

  // Expanded card content: last session, suggestion, set rows, tools.
  function body(e, big = false) {
    const ex = S.ex(e.exId); const date = GT.app.logDate;
    const last = S.history(e.exId).find((x) => x.date < date) || S.history(e.exId).find((x) => x.date !== date);
    const parts = [];
    if (last) {
      parts.push(h('div.lastline', [
        h('div.lastline-txt', [h('span.lastdate', fmtDate(last.date)), h('span.mono', last.sets.map((st) => `${st.r}×${fmtW(st.w)}`).join('  '))]),
        h('button.chip', { onclick: () => copyLast(e, last) }, [icon('copy', 14), 'Copy'])
      ]));
    } else parts.push(h('p.muted.small', 'First time logging this exercise.'));

    parts.push(h('div.sets' + (big ? '.big' : ''), [
      h('div.sets-head', [h('span', 'Set'), h('span', 'Reps'), h('span', unit()), h('span')]),
      ...e.sets.map((st, i) => setRow(e, st, i, last, big))
    ]));
    parts.push(h('div.excard-tools', [
      h('button.chip', { onclick: () => { const prev = e.sets[e.sets.length - 1]; e.sets.push({ w: prev ? prev.w : '', r: prev ? prev.r : '', t: 'n' }); save(); rerenderEntry(e); haptic(8); } }, [icon('plus', 14), 'Set']),
      e.swappedFrom ? h('button.chip', { onclick: () => undoSwap(e) }, [icon('undo', 14), 'Undo swap']) : h('button.chip', { onclick: () => swapSheet(e) }, [icon('swap', 14), 'Swap']),
      e.planIdx === null ? h('button.chip.danger', { onclick: () => removeEntry(e) }, [icon('trash', 14), 'Remove']) : null
    ]));
    return parts;
  }
  const plannedReps = (e) => (e.planIdx !== null ? W().planned[e.planIdx]?.reps : '') || '';

  // Set types cycle when you tap the set number: normal → warm-up → drop → failure.
  const TYPES = { n: '', w: 'W', d: 'D', f: 'F' }; const NEXT = { n: 'w', w: 'd', d: 'f', f: 'n' };
  function setRow(e, st, i, last, big) {
    const ghost = last && last.sets[i] ? last.sets[i] : null;
    const tr = plannedReps(e);
    const wIn = h('input.num.mono', { type: 'number', inputmode: 'decimal', step: 'any', value: st.w, placeholder: ghost ? fmtW(ghost.w) : '—', 'aria-label': `Set ${i + 1} weight` });
    const rIn = h('input.num.mono', { type: 'number', inputmode: 'numeric', value: st.r, placeholder: ghost ? String(ghost.r) : tr ? String(tr) : '—', 'aria-label': `Set ${i + 1} reps` });
    const read = () => { st.w = wIn.value === '' ? '' : Number(wIn.value); st.r = rIn.value === '' ? '' : Number(rIn.value); };
    // Keyboard flow: "Next" on the keypad goes reps → weight → next set's reps;
    // on the last weight box the key reads "Done" and closes the keyboard.
    const isLast = i === e.sets.length - 1;
    rIn.setAttribute('enterkeyhint', 'next'); wIn.setAttribute('enterkeyhint', isLast ? 'done' : 'next');
    const jump = (ev) => {
      if (ev.key !== 'Enter') return; ev.preventDefault();
      const boxes = [...ev.target.closest('.sets').querySelectorAll('input.num')];
      const nxt = boxes[boxes.indexOf(ev.target) + 1];
      if (nxt) nxt.focus(); else ev.target.blur();
    };
    wIn.addEventListener('keydown', jump); rIn.addEventListener('keydown', jump);
    // typing saves silently; leaving a box (change) checks whether the exercise is now complete
    wIn.addEventListener('input', () => { read(); save(); });
    rIn.addEventListener('input', () => { read(); save(); });
    wIn.addEventListener('change', () => { read(); autoComplete(e); });
    rIn.addEventListener('change', () => { read(); autoComplete(e); });
    const step = (input, delta) => { const base = input.value === '' ? Number(input.placeholder) || 0 : Number(input.value); input.value = Math.max(0, +(base + delta).toFixed(2)); read(); save(); haptic(5); };
    const inc = Number(S.s.settings.progression) || 2.5;
    return h('div.setrow' + (S.setValid(st) ? '.filled' : '') + (st.t && st.t !== 'n' ? '.t-' + st.t : ''), [
      h('button.setno.mono', { onclick: () => { st.t = NEXT[st.t || 'n']; save(); rerenderEntry(e); }, title: 'Tap to change set type' }, TYPES[st.t || 'n'] || String(i + 1)),
      h('div.stepper', [big ? h('button.step', { onclick: () => step(rIn, -1), 'aria-label': 'Fewer reps' }, icon('minus', 16)) : null, rIn, big ? h('button.step', { onclick: () => step(rIn, 1), 'aria-label': 'More reps' }, icon('plus', 16)) : null]),
      h('div.stepper', [big ? h('button.step', { onclick: () => step(wIn, -inc), 'aria-label': 'Less weight' }, icon('minus', 16)) : null, wIn, big ? h('button.step', { onclick: () => step(wIn, inc), 'aria-label': 'More weight' }, icon('plus', 16)) : null]),
      e.sets.length > 1 ? h('button.setdel', { onclick: () => {
        const [removed] = e.sets.splice(i, 1); save(); autoComplete(e, true);
        toast(`Set ${i + 1} removed`, 'ok', { label: 'Undo', fn: () => { e.sets.splice(i, 0, removed); save(); rerenderEntry(e); } });
      }, 'aria-label': 'Delete set' }, icon('x', 14)) : h('span')
    ]);
  }

  // v1 behaviour: once every set row has weight + reps, the exercise tick
  // turns green by itself. Clearing every row turns it back off.
  function autoComplete(e, forceRedraw) {
    const filled = e.sets.filter(S.setValid).length;
    if (!e.done && e.sets.length && filled === e.sets.length) { complete(e); return; }
    if (e.done && filled === 0) { e.done = false; save(); rerenderEntry(e); return; }
    save();
    if (forceRedraw) rerenderEntry(e);
    else refreshHead(e);
  }
  // Update just the n/n counter on a card without rebuilding inputs (keeps keyboard focus).
  function refreshHead(e) {
    const n = e.sets.filter(S.setValid).length;
    const c = root.querySelector(`.excard[data-uid="${e.uid}"] .setcount`); if (c) c.textContent = n ? `${n}/${e.sets.length}` : '';
    const tk = root.querySelector(`.excard[data-uid="${e.uid}"] .tick`); if (tk && !e.done) tk.classList.toggle('partial', n > 0);
  }

  // Marks the exercise done and turns the tick green. It deliberately stays on
  // the same exercise (no jumping to the next one) so you can still edit it.
  function complete(e) {
    e.done = true; save(); haptic([10, 30, 10]);
    toast(`${S.ex(e.exId).name} done`);
    rerenderEntry(e);
    // one soft light sweep across the row as it turns green
    const el = mode === 'focus' ? root.querySelector('.focus') : root.querySelector(`.excard[data-uid="${e.uid}"]`);
    if (el) { el.classList.add('just-done'); setTimeout(() => el.classList.remove('just-done'), 1300); }
  }
  function rerenderEntry(e) { if (mode === 'focus') GT.app.rerender(); else refreshCard(e); }

  // The single tick beside the exercise name. Off → fills any empty boxes
  // from last session (or planned reps) and marks the exercise done. On → undo.
  function toggleAll(e) {
    if (e.done) { e.done = false; save(); haptic(8); rerenderEntry(e); return; }
    const last = S.history(e.exId).find((x) => x.date < GT.app.logDate);
    e.sets.forEach((st, i) => {
      if (st.w === '' && last?.sets[i]) st.w = last.sets[i].w;
      if (st.r === '' && (last?.sets[i] || plannedReps(e))) st.r = last?.sets[i] ? last.sets[i].r : Number(plannedReps(e));
    });
    if (!e.sets.some(S.setValid)) { toast('Enter weight and reps first — or tap Copy', 'error'); openUid = e.uid; refreshCard(e); return; }
    e.sets = e.sets.filter(S.setValid); // drop rows left empty
    complete(e);
  }

  function copyLast(e, last) {
    last.sets.forEach((ls, i) => { if (!e.sets[i]) e.sets.push({ w: '', r: '', t: 'n' }); e.sets[i].w = ls.w; e.sets[i].r = ls.r; e.sets[i].t = ls.t || 'n'; });
    save(); haptic(10); toast('Copied last session'); autoComplete(e, true);
  }

  // ---------- focus view ----------
  function focusView(w) {
    focusIdx = Math.min(Math.max(0, focusIdx), w.entries.length - 1);
    const e = w.entries[focusIdx]; const ex = S.ex(e.exId);
    const hist = S.history(e.exId).filter((x) => x.date !== GT.app.logDate).slice(0, 3);
    const el = h('section.focus.glass' + (S.entryComplete(e) ? '.done' : ''), { style: { '--m': muscleColor(ex.muscle) } }, [
      h('div.focus-dots', w.entries.map((x, i) => h('i' + (i === focusIdx ? '.on' : '') + (S.entryComplete(x) ? '.ok' : ''), { onclick: () => { focusIdx = i; GT.app.rerender(); } }))),
      h('div.focus-head', [
        h('button.icon-btn', { onclick: () => { focusIdx--; GT.app.rerender(); }, disabled: focusIdx === 0, 'aria-label': 'Previous exercise' }, icon('left')),
        h('div.center', [h('small.eyebrow', `${focusIdx + 1} of ${w.entries.length} · ${ex.muscle}`), h('h2', ex.name), e.swappedFrom ? h('small.swapped', ['↪ Swapped from ', S.ex(e.swappedFrom).name]) : null]),
        h('button.icon-btn', { onclick: () => { focusIdx++; GT.app.rerender(); }, disabled: focusIdx === w.entries.length - 1, 'aria-label': 'Next exercise' }, icon('right'))
      ]),
      // the same single tick as the list view; goes green by itself when every set is filled
      h('div.row.focus-tickrow', [
        h('button.tick' + (e.done ? '.on' : ''), { onclick: () => toggleAll(e), 'aria-label': e.done ? 'Mark incomplete' : 'Mark exercise done' }, icon('check', 20))]),
      h('div.focus-body', body(e, true)),
      hist.length ? h('div.focus-hist', [h('small.eyebrow', 'Recent sessions'), ...hist.map((x) => h('div.row.between', [h('span.muted', fmtDate(x.date)), h('span.mono.small', x.sets.map((st) => `${st.r}×${fmtW(st.w)}`).join(' '))]))]) : null
    ]);
    // horizontal swipe between exercises
    let x0 = null, y0 = null;
    el.addEventListener('touchstart', (ev) => { if (ev.target.closest('input')) return; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (ev) => {
      if (x0 === null) return; const dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { const n = focusIdx + (dx < 0 ? 1 : -1); if (n >= 0 && n < w.entries.length) { focusIdx = n; haptic(6); GT.app.rerender(); } }
    });
    return el;
  }


  // ---------- bottom actions ----------
  function actions(w, date) {
    const logged = w.entries.some(S.entryLogged);
    return h('div.log-actions', [
      h('div.row.gap.text-actions', [
        h('button.btn.text.grow', { onclick: () => switchSheet(date) }, [icon('folder', 18), 'Load workout']),
        h('button.btn.text.grow', { onclick: () => pickExercise('Add exercise', (exId) => { const ent = S.newEntry(exId, 3); W().entries.push(ent); openUid = ent.uid; save(); GT.app.rerender(); toast(`${S.ex(exId).name} added`); }) }, [icon('plus', 18), 'Add exercise'])
      ]),
      h('button.btn.primary.wide.finish', { onclick: () => finish(w), disabled: !logged }, [icon('check', 18), w.finishedAt ? 'Update summary' : 'Finish workout']),
      !logged ? h('label.toggle-row', [h('input', { type: 'checkbox', checked: !!S.s.omitted[date], onchange: (ev) => { if (ev.target.checked) S.s.omitted[date] = true; else delete S.s.omitted[date]; save(); toast(ev.target.checked ? 'Day omitted from streak & completion' : 'Day counts again'); } }), h('span.switch'), h('span', 'Omit this day from streak and completion')]) : null
    ]);
  }

  // ---------- sheets ----------
  function switchSheet(date) {
    const pick = (src) => {
      sh.close();
      const w = W(); const hasLogged = w.entries.some(S.entryLogged);
      const choose = sheet('How should it load?', [
        h('button.option', { onclick: () => { choose.close(); S.switchWorkout(date, src, 'replace'); openUid = null; save(); GT.app.rerender(); toast('Workout loaded'); } }, [h('div', [h('strong', 'Replace today'), h('small', (hasLogged ? 'Logged sets are kept; untouched exercises are replaced. ' : '') + 'Today\'s completion % will be based on this workout')])]),
        h('button.option', { onclick: () => { choose.close(); S.switchWorkout(date, src, 'add'); save(); GT.app.rerender(); toast('Exercises added'); } }, [h('div', [h('strong', 'Add to today'), h('small', 'Keeps today\'s plan and appends these as extras — extras don\'t change today\'s completion %')])])
      ]);
    };
    const days = S.DAYS.map((d) => { const p = S.s.plan[d]; return h('button.option', { onclick: () => pick({ type: 'day', day: d }) }, [h('div', [h('strong', d + (d === S.weekday(date) ? ' (planned)' : '')), h('small', `${p.name} · ${p.items.length} exercises`)]), h('div.chips.tight', (p.muscles || []).slice(0, 3).map((m) => h('i.dot', { style: { background: muscleColor(m) } })))]); });
    const routines = Object.values(S.s.routines).map((r) => h('button.option', { onclick: () => pick({ type: 'routine', id: r.id }) }, [h('div', [h('strong', r.name), h('small', `${r.items.length} exercises`)]), icon('right')]));
    const sh = sheet('Load workout', [h('p.section-label', 'Saved workouts'), routines.length ? routines : h('p.muted.small', 'No saved workouts yet — create one in Plan.'), h('p.section-label', 'Weekly plan days'), days], { full: true });
  }

  // Exercise picker shared by Add, Swap, Plan and Routines. onPick(exId).
  function pickExercise(title, onPick, opts = {}) {
    const input = h('input.field', { placeholder: 'Search or type a new exercise…', type: 'search' });
    const list = h('div.picklist');
    const draw = () => {
      const q = input.value.trim(); const qc = S.canon(q); list.innerHTML = '';
      const all = Object.values(S.s.exercises).filter((e) => !opts.exclude || e.id !== opts.exclude);
      const match = all.filter((e) => !qc || S.canon(e.name).includes(qc));
      if (q && !all.some((e) => S.canon(e.name) === qc)) {
        list.append(h('button.option.new', { onclick: () => newExerciseSheet(q, (id) => { sh.close(); onPick(id); }) }, [icon('plus'), h('div', [h('strong', `Create “${q}”`), h('small', 'New exercise with its own history')])]));
      }
      if (opts.top && opts.top.length && !q) { list.append(h('p.section-label', opts.topLabel || 'Suggested')); opts.top.forEach(([id, label]) => list.append(item(S.ex(id), label))); }
      const groups = {};
      match.forEach((e) => (groups[e.muscle] = groups[e.muscle] || []).push(e));
      const order = opts.muscleFirst ? [opts.muscleFirst, ...Object.keys(groups).filter((m) => m !== opts.muscleFirst)] : Object.keys(groups).sort();
      order.forEach((m) => { if (!groups[m]) return; list.append(h('p.section-label', [h('i.dot', { style: { background: muscleColor(m) } }), m])); groups[m].sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => list.append(item(e))); });
    };
    const item = (e, label) => h('button.option', { onclick: () => { sh.close(); onPick(e.id); } }, [h('div', [h('strong', e.name), h('small', label || `${S.history(e.id).length} sessions logged`)]), icon('right')]);
    input.addEventListener('input', draw);
    const sh = sheet(title, [input, list], { full: true });
    draw();
  }
  function newExerciseSheet(name, done) {
    const sel = h('select.field', S.s.muscles.map((m) => h('option', { value: m, selected: m === S.guessMuscle(name) }, m)));
    const nm = h('input.field', { value: name });
    const sh = sheet('New exercise', [h('label.field-label', 'Name'), nm, h('label.field-label', 'Muscle group'), sel], { footer: [h('button.btn.primary.wide', { onclick: () => { const ex = S.ensureExercise(nm.value.trim() || name, sel.value); save(); sh.close(); done(ex.id); } }, 'Create')] });
  }

  function swapSheet(e) {
    const ex = S.ex(e.exId); const mem = S.swapMemory(e.exId);
    pickExercise(`Swap ${ex.name}`, (newId) => {
      if (e.done) { toast('Untick this exercise before swapping it', 'error'); return; }
      e.swappedFrom = e.exId; e.exId = newId; save(); GT.app.rerender();
      toast(`Swapped to ${S.ex(newId).name}`, 'ok', { label: 'Undo', fn: () => undoSwap(e) });
    }, { exclude: e.exId, top: mem.map(([id, n]) => [id, `Swapped in ${n}× before`]), topLabel: 'You usually swap with', muscleFirst: ex.muscle });
  }
  async function undoSwap(e) {
    if (S.entryLogged(e) && !(await confirm('This clears the sets logged for the swapped exercise.', 'Undo swap', true))) return;
    e.exId = e.swappedFrom; e.swappedFrom = null; e.done = false; e.sets.forEach((st) => { st.w = ''; st.r = ''; }); save(); GT.app.rerender();
  }
  function removeEntry(e) {
    const w = W(); const at = w.entries.indexOf(e); w.entries.splice(at, 1); save(); GT.app.rerender();
    toast(`${S.ex(e.exId).name} removed`, 'ok', { label: 'Undo', fn: () => { w.entries.splice(at, 0, e); save(); GT.app.rerender(); } });
  }


  // ---------- finish ----------
  async function finish(w) {
    // No duration is recorded: you may log at home or a day later, so clock
    // time would be meaningless. Finish just marks the day and shows a summary.
    w.finishedAt = Date.now(); save();
    const logged = w.entries.filter(S.entryLogged);
    const sets = logged.reduce((a, e) => a + S.doneSets(e).length, 0);
    const vol = logged.reduce((a, e) => a + S.volumeOf(S.doneSets(e)), 0);
    const prs = S.prsOn(w.date);
    // compare with the previous workout of the same label
    const label = S.dayLabel(w.date);
    const prev = Object.values(S.s.workouts).filter((x) => x.date < w.date && S.dayLabel(x.date) === label && x.entries.some(S.entryLogged)).sort((a, b) => b.date.localeCompare(a.date))[0];
    const prevVol = prev ? prev.entries.filter(S.entryLogged).reduce((a, e) => a + S.volumeOf(S.doneSets(e)), 0) : null;
    const delta = prevVol ? Math.round(((vol - prevVol) / prevVol) * 100) : null;
    const { done, total } = S.plannedDoneCount(w.date);
    haptic([20, 40, 20, 40, 60]);
    const sh = sheet('Workout complete', [
      h('div.summary-hero', [h('div.burst', icon('trophy', 36)), h('h2', label), h('p.muted', fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' }))]),
      h('div.grid3', [
        stat(String(logged.length), 'exercises'), stat(`${done}/${total}`, 'planned done'), stat(String(sets), 'sets'),
        stat(fmtNum(vol), `${unit()} volume`), stat(delta === null ? '—' : (delta > 0 ? '+' : '') + delta + '%', 'vs last ' + label.split(',')[0]), stat(String(prs.length), 'PRs')
      ]),
      prs.length ? h('div.card.inset', [h('p.section-label', 'New personal records'), ...prs.map((id) => h('div.row.gap', [icon('trophy', 16), h('span', S.ex(id).name)]))]) : null
    ], { footer: [
      h('button.btn.primary.grow', { onclick: () => { sh.close(); GT.app.rerender(); } }, 'Done')
    ] });
  }
  const stat = (v, l) => h('div.mini-stat', [h('strong.mono', v), h('small', l)]);

  GT.log = { render, pickExercise, newExerciseSheet };
})();
