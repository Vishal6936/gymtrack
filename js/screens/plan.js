/* Plan — weekly split (7 days), saved workouts (routines like Arms
 * Annihilation) and timer session layouts. One editor handles plan days and
 * routines; edits to the weekly plan flow straight into today's Log. */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, sheet, toast, confirm, prompt, fmtNum } = GT.ui;
  const S = GT.store;

  let section = 'week'; // week | routines | timers

  function render(root, params) {
    if (params && params.section) section = params.section;
    const today = S.weekday(S.todayKey());
    root.append(
      h('header.top', [h('div.grow', [h('h1', 'Plan')])]),
      h('div.seg', [['week', 'Weekly split'], ['routines', 'Saved workouts'], ['timers', 'Timer sessions']].map(([k, l]) => h('button' + (section === k ? '.on' : ''), { onclick: () => { section = k; GT.app.rerender(); } }, l)))
    );
    if (section === 'week') {
      root.append(h('div.cards', S.DAYS.map((d) => {
        const p = S.s.plan[d];
        return h('article.card.glass.plan-day' + (d === today ? '.is-today' : ''), { onclick: () => editItems({ kind: 'day', day: d }) }, [
          h('div.row.between', [h('div', [h('small.eyebrow', d + (d === today ? ' · today' : '')), h('strong', p.items.length ? p.name : 'Rest Day')]), h('span.mono.muted', `${p.items.length} ex · ${p.items.reduce((a, i) => a + i.sets, 0)} sets`)]),
          h('div.chips.tight', (p.muscles || []).map((m) => h('span.mchip', { style: { '--m': muscleColor(m) } }, m))),
          p.items.length ? h('ol.plan-list', p.items.map((it) => h('li', [h('span', S.ex(it.exId).name), h('span.mono.muted', `${it.sets}×${it.reps}`)]))) : null
        ]);
      })));
    } else if (section === 'routines') {
      const list = Object.values(S.s.routines);
      root.append(
        h('div.cards', list.map((r) => h('article.card.glass.plan-day', { onclick: () => editItems({ kind: 'routine', id: r.id }) }, [
          h('div.row.between', [h('strong', r.name), h('span.mono.muted', `${r.items.length} ex`)]),
          h('ol.plan-list', r.items.slice(0, 6).map((it) => h('li', [h('span', S.ex(it.exId).name), h('span.mono.muted', `${it.sets}×${it.reps}`)])))
        ]))),
        h('button.btn.primary.wide', { onclick: async () => { const name = await prompt('Name this workout', '', 'e.g. Arms Annihilation'); if (!name) return; const id = S.uid('rt'); S.s.routines[id] = { id, name, items: [] }; S.save(); editItems({ kind: 'routine', id }); } }, [icon('plus', 18), 'New saved workout'])
      );
    } else {
      const cfg = S.s.timer;
      root.append(
        h('div.cards', Object.values(cfg.layouts).map((l) => { const tot = l.phases.reduce((a, p) => a + p.sec, 0);
          return h('article.card.glass.plan-day' + (cfg.selected === l.id ? '.is-today' : ''), { onclick: () => editLayout(l.id) }, [
            h('div.row.between', [h('strong', l.name), h('span.mono.muted', `${Math.round(tot / 60)} min${cfg.selected === l.id ? ' · active' : ''}`)]),
            h('div.timeline.small', l.phases.map((p) => h('div.tl-seg', { style: { flex: p.sec } }, h('span', `${p.name} ${Math.round(p.sec / 60)}m`))))
          ]); })),
        h('button.btn.primary.wide', { onclick: () => { const id = S.uid('tl'); cfg.layouts[id] = { id, name: 'New session', phases: [{ name: 'Warm-up', sec: 600 }, { name: 'Workout', sec: 3600 }] }; S.save(); editLayout(id); } }, [icon('plus', 18), 'New timer session'])
      );
    }
  }

  // ---------- day / routine editor ----------
  function editItems(target) {
    const src = target.kind === 'day' ? S.s.plan[target.day] : S.s.routines[target.id];
    const draft = S.clone(src); // edit a copy; Save commits
    const nameIn = h('input.field', { value: draft.name, placeholder: 'e.g. Back, Biceps, Rear Delts' });
    const list = h('div.edit-list');
    const muscleWrap = h('div.chips');

    const drawMuscles = () => {
      muscleWrap.innerHTML = '';
      [...S.s.muscles, 'Rest'].forEach((m) => { const on = (draft.muscles || []).includes(m);
        muscleWrap.append(h('button.mchip.toggle' + (on ? '.on' : ''), { style: { '--m': muscleColor(m) }, onclick: () => { draft.muscles = on ? draft.muscles.filter((x) => x !== m) : [...(draft.muscles || []), m]; drawMuscles(); } }, m)); });
    };
    const draw = () => {
      list.innerHTML = '';
      if (!draft.items.length) list.append(h('p.muted.small', 'No exercises — this is a rest day.'));
      draft.items.forEach((it, i) => {
        const ex = S.ex(it.exId);
        list.append(h('div.edit-row', { style: { '--m': muscleColor(ex.muscle) } }, [
          h('span.drag-handle', { 'aria-label': 'Drag to reorder' }, icon('drag', 18)),
          h('div.grow', [h('strong', ex.name), h('div.row.gap.small', [counter('sets', it, 'sets', 1, 10, draw), counter('reps', it, 'reps', 1, 50, draw)])]),
          h('button.icon-btn.sm', { onclick: () => renameSheet(it, draw), 'aria-label': 'Rename' }, icon('edit', 16)),
          h('button.icon-btn.sm.danger', { onclick: () => { draft.items.splice(i, 1); draw(); }, 'aria-label': 'Remove' }, icon('trash', 16))
        ]));
      });
    };
    // hold the ⋮⋮ handle and drag to reorder
    GT.ui.dragSort(list, (from, to) => { const [it] = draft.items.splice(from, 1); draft.items.splice(to, 0, it); draw(); });
    const body = [h('label.field-label', 'Name'), nameIn];
    if (target.kind === 'day') body.push(h('label.field-label', 'Muscle groups'), muscleWrap);
    body.push(h('label.field-label', 'Exercises'), list, h('button.btn.ghost.wide', { onclick: () => GT.log.pickExercise('Add to ' + (draft.name || 'plan'), (id) => { draft.items.push({ exId: id, sets: 3, reps: 12 }); draw(); }) }, [icon('plus', 18), 'Add exercise']));
    if (target.kind === 'routine') body.push(h('button.btn.ghost.wide.danger', { onclick: async () => { if (!(await confirm(`Delete “${src.name}”?`, 'Delete', true))) return; delete S.s.routines[target.id]; S.save(); sh.close(); GT.app.rerender(); } }, [icon('trash', 16), 'Delete saved workout']));
    else body.push(h('button.btn.ghost.wide', { onclick: () => { copyDaySheet(target.day, draft, draw, nameIn, drawMuscles); } }, [icon('copy', 16), 'Copy from another day']));

    const sh = sheet(target.kind === 'day' ? `Edit ${target.day}` : 'Edit saved workout', body, { full: true, footer: [h('button.btn.primary.wide', { onclick: () => {
      draft.name = nameIn.value.trim() || (draft.items.length ? draft.name : 'Rest Day');
      if (target.kind === 'day') { S.s.plan[target.day] = draft; S.syncPlanToOpenWorkouts(); } else S.s.routines[target.id] = draft;
      S.save(); sh.close(); GT.app.rerender(); toast('Saved — Log is updated');
    } }, 'Save')] });
    drawMuscles(); draw();
  }

  function counter(label, obj, key, lo, hi, redraw) {
    return h('span.counter', [
      h('button', { onclick: () => { obj[key] = Math.max(lo, obj[key] - 1); redraw(); }, 'aria-label': `Fewer ${label}` }, '−'),
      h('span.mono', `${obj[key]} ${label}`),
      h('button', { onclick: () => { obj[key] = Math.min(hi, obj[key] + 1); redraw(); }, 'aria-label': `More ${label}` }, '+')
    ]);
  }

  // Renaming asks the question v1 left implicit: is this the same exercise
  // with a better name, or a new variation that deserves its own history?
  function renameSheet(item, redraw) {
    const ex = S.ex(item.exId); const nm = h('input.field', { value: ex.name });
    const sh = sheet('Rename exercise', [nm,
      h('button.option', { onclick: () => { const v = nm.value.trim(); if (!v) return; ex.name = v; S.save(); sh.close(); redraw(); toast('Renamed everywhere — history kept'); } }, [h('div', [h('strong', 'Rename (keep history)'), h('small', `Same exercise, new name. All ${S.history(ex.id).length} past sessions stay attached.`)])]),
      h('button.option', { onclick: () => { const v = nm.value.trim(); if (!v || S.canon(v) === S.canon(ex.name)) { toast('Use a different name for a variation', 'error'); return; } const nx = S.ensureExercise(v, ex.muscle); item.exId = nx.id; S.save(); sh.close(); redraw(); toast('Variation created with its own history'); } }, [h('div', [h('strong', 'Create variation (new history)'), h('small', 'e.g. “Barbell Curl Variation” — tracked separately from the original.')])])
    ]);
  }

  function copyDaySheet(day, draft, draw, nameIn, drawMuscles) {
    const sh = sheet('Copy from…', S.DAYS.filter((d) => d !== day).map((d) => h('button.option', { onclick: () => { const p = S.s.plan[d]; draft.items = S.clone(p.items); draft.name = p.name; draft.muscles = S.clone(p.muscles || []); nameIn.value = p.name; draw(); drawMuscles(); sh.close(); } }, [h('div', [h('strong', d), h('small', `${S.s.plan[d].name} · ${S.s.plan[d].items.length} exercises`)])])));
  }

  // ---------- timer layout editor ----------
  function editLayout(id) {
    const cfg = S.s.timer; const draft = S.clone(cfg.layouts[id]);
    const nameIn = h('input.field', { value: draft.name, disabled: draft.locked });
    const list = h('div.edit-list'); const total = h('p.muted.small');
    const draw = () => {
      list.innerHTML = '';
      draft.phases.forEach((p, i) => {
        const n = h('input.field', { value: p.name, disabled: draft.locked, oninput: (e) => { p.name = e.target.value; } });
        const m = h('input.field.mono.w80', { type: 'number', inputmode: 'numeric', value: Math.round(p.sec / 60), disabled: draft.locked, oninput: (e) => { p.sec = Math.max(1, Number(e.target.value) || 1) * 60; total.textContent = `Total ${Math.round(draft.phases.reduce((a, x) => a + x.sec, 0) / 60)} min`; } });
        list.append(h('div.edit-row', [h('div.grow', n), m, h('span.muted.small', 'min'), draft.locked ? null : h('button.icon-btn.sm.danger', { onclick: () => { draft.phases.splice(i, 1); draw(); }, 'aria-label': 'Remove phase' }, icon('trash', 16))]));
      });
      total.textContent = `Total ${Math.round(draft.phases.reduce((a, x) => a + x.sec, 0) / 60)} min`;
    };
    const body = [h('label.field-label', 'Name'), nameIn, h('label.field-label', 'Phases'), list, total];
    if (draft.locked) body.unshift(h('p.muted.small', 'The default session is locked. Duplicate it to make your own.'));
    else body.push(h('button.btn.ghost.wide', { onclick: () => { draft.phases.push({ name: 'Phase', sec: 300 }); draw(); } }, [icon('plus', 18), 'Add phase']));
    const sh = sheet('Timer session', body, { full: true, footer: [
      h('button.btn.ghost.grow', { onclick: () => { cfg.selected = id; S.save(); sh.close(); GT.app.rerender(); toast(`${draft.name} is now active`); } }, 'Use this'),
      draft.locked ? h('button.btn.primary.grow', { onclick: () => { const nid = S.uid('tl'); cfg.layouts[nid] = Object.assign(S.clone(draft), { id: nid, name: draft.name + ' copy', locked: false }); S.save(); sh.close(); editLayout(nid); } }, 'Duplicate')
        : h('button.btn.primary.grow', { onclick: () => { draft.name = nameIn.value.trim() || 'Session'; draft.phases = draft.phases.filter((p) => p.name.trim()); if (!draft.phases.length) { toast('Add at least one phase', 'error'); return; } cfg.layouts[id] = draft; S.save(); sh.close(); GT.app.rerender(); } }, 'Save'),
      !draft.locked ? h('button.icon-btn.danger', { onclick: async () => { if (!(await confirm('Delete this timer session?', 'Delete', true))) return; delete cfg.layouts[id]; if (cfg.selected === id) cfg.selected = 'default'; S.save(); sh.close(); GT.app.rerender(); }, 'aria-label': 'Delete' }, icon('trash')) : null
    ] });
    draw();
  }

  GT.plan = { render, editLayout };
})();
