/* Activity — month calendar (logged / missed / rest / omitted, shaded by
 * completion), month summary, exercise search that highlights matching days,
 * and a day breakdown: ✓ done, ↪ substituted, ○ not logged, + extra. */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, fmtW, fmtDate, fmtNum } = GT.ui;
  const S = GT.store;

  let month = null;      // 'YYYY-MM'
  let selected = null;   // date key
  let searchId = null;   // exercise to highlight
  let view = 'month';    // 'month' | 'week'
  let weekStart = null;  // Monday of the week shown in week view

  function render(root) {
    const t = S.todayKey();
    if (!month) month = t.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`; const days = new Date(y, m, 0).getDate();
    const lead = (S.parseKey(first).getDay() + 6) % 7; // Monday-first grid
    const matchDates = searchId ? new Set(S.history(searchId).map((x) => x.date)) : null;

    // month summary
    let wd = 0, cs = 0, cn = 0, pd = 0, pt = 0;
    for (let d = 1; d <= days; d++) {
      const k = `${month}-${String(d).padStart(2, '0')}`; if (k > t) break;
      if (S.hasWorkout(k)) wd++;
      const c = S.completion(k); if (c !== null) { cs += c; cn++; const pc = S.plannedDoneCount(k); pd += pc.done; pt += pc.total; }
    }

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span.cal-cell.pad'));
    for (let d = 1; d <= days; d++) {
      const k = `${month}-${String(d).padStart(2, '0')}`; const st = S.dayStatus(k); const c = S.completion(k);
      cells.push(h('button.cal-cell.' + st + (k === t ? '.is-today' : '') + (k === selected ? '.sel' : '') + (matchDates && matchDates.has(k) ? '.match' : ''),
        { onclick: () => { selected = k; GT.ui.haptic(6); GT.app.rerender(); requestAnimationFrame(() => document.getElementById('dayd')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }, style: { '--c': c === null ? 0 : c / 100 } },
        // thin line under each day = that day's completion %
        [h('span', String(d)), c !== null ? h('span.cline', h('b', { style: { width: c + '%' } })) : null]));
    }

    if (!weekStart) weekStart = S.addDays(t, -((S.parseKey(t).getDay() + 6) % 7));
    root.append(
      h('header.top', [h('div', [h('h1', 'Activity')]),
        h('div.seg.mini', [['month', 'Month'], ['week', 'Week']].map(([v, l]) => h('button' + (view === v ? '.on' : ''), { onclick: () => { view = v; GT.app.rerender(); } }, l)))]),
      view === 'week' ? weekView(t, matchDates) : h('section.card.glass', [
        h('div.row.between', [
          h('button.icon-btn', { onclick: () => { month = shift(month, -1); GT.app.rerender(); }, 'aria-label': 'Previous month' }, icon('left')),
          h('strong', new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })),
          h('button.icon-btn', { onclick: () => { month = shift(month, 1); GT.app.rerender(); }, 'aria-label': 'Next month' }, icon('right'))
        ]),
        h('div.cal-head', ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => h('span', x))),
        h('div.cal-grid', cells)
      ]),
      h('section.grid3', [mini(String(wd), 'workout days'), mini(cn ? Math.round(cs / cn) + '%' : '—', 'avg completion'), mini(pt ? `${pd}/${pt}` : '—', 'planned done')]),
      h('button.card.glass.search-row', { onclick: () => GT.log.pickExercise('Find an exercise', (id) => { searchId = id; GT.app.rerender(); }) }, [icon('search', 18), h('span', searchId ? ['Highlighting ', h('strong', S.ex(searchId).name)] : 'Find the days you did an exercise…'), searchId ? h('span.chip', { onclick: (e) => { e.stopPropagation(); searchId = null; GT.app.rerender(); } }, 'Clear') : null]),
      selected ? dayDetails(selected) : null
    );
  }
  // Week view: one row per day with its workout, sets summary and completion bar.
  function weekView(t, matchDates) {
    const days = S.DAYS.map((_, i) => S.addDays(weekStart, i));
    return h('section.card.glass', [
      h('div.row.between', [
        h('button.icon-btn', { onclick: () => { weekStart = S.addDays(weekStart, -7); GT.app.rerender(); }, 'aria-label': 'Previous week' }, icon('left')),
        h('strong', `${fmtDate(days[0])} – ${fmtDate(days[6])}`),
        h('button.icon-btn', { onclick: () => { weekStart = S.addDays(weekStart, 7); GT.app.rerender(); }, 'aria-label': 'Next week' }, icon('right'))
      ]),
      h('div.weekview', days.map((k) => {
        const st = S.dayStatus(k); const c = S.completion(k); const { done, total } = S.plannedDoneCount(k);
        return h('button.wv-day' + (k === t ? '.is-today' : '') + (matchDates && matchDates.has(k) ? '.match' : ''), { onclick: () => { selected = k; GT.app.rerender(); requestAnimationFrame(() => document.getElementById('dayd')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); } }, [
          h('div.wv-date', [h('small', S.weekday(k).slice(0, 3)), h('strong.mono', String(S.parseKey(k).getDate()))]),
          h('div.grow', [h('strong', S.dayLabel(k)), h('small.muted.block', st === 'logged' ? `${done}/${total} planned done` : st === 'missed' ? 'Missed' : st === 'rest' ? 'Rest' : st === 'omitted' ? 'Omitted' : st === 'future' ? 'Upcoming' : st === 'today' ? 'Today' : '—'),
            c !== null ? h('div.wv-bar', h('b', { style: { width: c + '%' } })) : null]),
          c !== null ? h('span.mono.small', c + '%') : null
        ]);
      }))
    ]);
  }
  // Called from Snapshot: jump to a date's details.
  function openDate(k) { month = k.slice(0, 7); weekStart = S.addDays(k, -((S.parseKey(k).getDay() + 6) % 7)); selected = k; GT.app.go('activity'); requestAnimationFrame(() => setTimeout(() => document.getElementById('dayd')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250)); }

  const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const mini = (v, l) => h('div.card.glass.mini-stat', [h('strong.mono', v), h('small', l)]);

  function dayDetails(date) {
    const w = S.s.workouts[date]; const planned = S.plannedFor(date);
    const entries = w ? w.entries : [];
    const rows = [];
    planned.forEach((p, i) => {
      const e = entries.find((x) => x.planIdx === i && S.entryLogged(x));
      const sets = e ? S.doneSets(e).map((st) => `${st.r}×${fmtW(st.w)}`).join(' · ') : '';
      if (e && e.swappedFrom) rows.push(row('sub', '↪', S.ex(e.exId).name, `Substituted for ${S.ex(p.exId).name}`, sets, S.ex(e.exId).muscle));
      else if (e) rows.push(row('ok', '✓', S.ex(p.exId).name, null, sets, S.ex(p.exId).muscle));
      else rows.push(row('no', '○', S.ex(p.exId).name, null, date > S.todayKey() ? 'Upcoming' : 'Not logged', S.ex(p.exId).muscle));
    });
    entries.filter((e) => e.planIdx === null && S.entryLogged(e)).forEach((e) => rows.push(row('extra', '+', S.ex(e.exId).name, 'Extra exercise', S.doneSets(e).map((st) => `${st.r}×${fmtW(st.w)}`).join(' · '), S.ex(e.exId).muscle)));
    const logged = entries.filter(S.entryLogged);
    const vol = logged.reduce((a, e) => a + S.volumeOf(S.doneSets(e)), 0);
    const c = S.completion(date); const prs = S.prsOn(date).length; const subs = logged.filter((e) => e.swappedFrom).length;
    return h('section.card.glass.dayd', { id: 'dayd' }, [
      h('div.row.between', [h('div', [h('strong', fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })), h('small.muted.block', w && w.source.type !== 'plan' ? `${S.weekday(date)} swapped with ${w.source.label}` : S.dayLabel(date))]), c !== null ? h('span.pill.' + (c >= 100 ? 'ok' : c > 0 ? 'live' : 'idle'), c + '%') : S.s.omitted[date] ? h('span.pill.rest', 'Omitted') : null]),
      h('div.chips.tight', [chip(logged.length, 'exercises'), chip(fmtNum(vol), S.s.settings.unit), chip(prs, 'PRs'), subs ? chip(subs, 'swaps') : null]),
      rows.length ? h('div.daylist', rows) : h('p.muted', 'Rest day — nothing planned.'),
      h('button.btn.ghost.wide', { onclick: () => { GT.app.logDate = date; GT.app.go('log'); } }, [icon('edit', 16), 'Open in Log'])
    ]);
  }
  const chip = (v, l) => h('span.chip.static', [h('strong.mono', String(v)), ' ', l]);
  const row = (cls, mark, name, sub, sets, muscle) => h('div.dayrow.' + cls, { style: { '--m': muscleColor(muscle) } }, [h('span.mark', mark), h('div.grow', [h('strong', name), sub ? h('small.block', sub) : null]), h('span.mono.small.sets', sets)]);

  GT.activity = { render, openDate };
})();
