/* Snapshot — read-only view of past data for the day's exercises, for the
 * gym floor. One card open at a time; each shows a history table (date rows ×
 * set columns), green/red dates for volume up/down, the all-time best set
 * highlighted, and a volume trend chart underneath. */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, fmtW, fmtDate, fmtNum, lineChart } = GT.ui;
  const S = GT.store;

  let open = null;
  let view = 'all'; // all | last3 | last5 | month | weekday
  let showAll = null; // exercise id whose full history is expanded (default: latest 8 rows)

  function render(root) {
    const date = GT.app.snapDate; const t = S.todayKey();
    const w = S.s.workouts[date];
    // exercises for the day: planned (or switched) list, plus anything swapped/added
    const ids = [];
    const pushId = (id) => { if (id && !ids.includes(id)) ids.push(id); };
    // The day's planned list (its saved copy for past days) — each slot shows what
    // was actually done there (a swap) if logged — then any extras. A past day
    // you never opened therefore still shows its plan.
    const planned = S.plannedFor(date); const entries = w ? w.entries : [];
    planned.forEach((p, i) => { const e = entries.find((x) => x.planIdx === i && S.entryLogged(x)); pushId(e ? e.exId : p.exId); });
    entries.filter((e) => e.planIdx === null).forEach((e) => pushId(e.exId));
    const wd = S.weekday(date);
    const views = [['all', 'All'], ['last3', 'Last 3'], ['last5', 'Last 5'], ['month', 'Month'], ['weekday', wd.slice(0, 3) + 's']];

    root.append(
      // title on the left, ‹ date › on the same line (tap the date to jump back to today)
      h('header.top.snap-top', [h('h1', 'Snapshot'), h('div.datenav.inline', [
        h('button.icon-btn', { onclick: () => { GT.app.snapDate = S.addDays(date, -1); open = null; GT.app.rerender(); }, 'aria-label': 'Previous day' }, icon('left')),
        h('button.datenav-mid', { onclick: () => { GT.app.snapDate = t; GT.app.rerender(); }, title: 'Back to today' }, h('strong', fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' }))),
        h('button.icon-btn', { onclick: () => { GT.app.snapDate = S.addDays(date, 1); open = null; GT.app.rerender(); }, 'aria-label': 'Next day' }, icon('right'))
      ])]),
      h('div.card.glass', [h('strong', S.dayLabel(date)), w && w.source.type !== 'plan' ? h('small.swapped.block', `${wd} swapped with ${w.source.label}`) : null,
        h('div.seg.scroll', views.map(([v, l]) => h('button' + (view === v ? '.on' : ''), { onclick: () => { view = v; GT.app.rerender(); } }, l)))]),
      ids.length ? h('div.cards', ids.map((id) => snapCard(id, date))) : h('div.empty.card.glass', [icon('snap', 32), h('p', 'Nothing planned for this day.')])
    );
  }

  function filter(hist, date) {
    if (view === 'last3') return hist.slice(0, 3);
    if (view === 'last5') return hist.slice(0, 5);
    if (view === 'month') return hist.filter((x) => x.date.slice(0, 7) === date.slice(0, 7));
    if (view === 'weekday') return hist.filter((x) => S.weekday(x.date) === S.weekday(date));
    return hist;
  }

  function snapCard(id, date) {
    const ex = S.ex(id); const all = S.history(id); const isOpen = open === id;
    const last = all.find((x) => x.date <= date);
    const vol = (x) => x.sets.reduce((a, st) => a + st.w * st.r, 0);
    // "+5% vs last": latest session's volume vs the session before it
    const li = last ? all.indexOf(last) : -1; const before = li >= 0 ? all[li + 1] : null;
    const delta = last && before && vol(before) ? Math.round(((vol(last) - vol(before)) / vol(before)) * 100) : null;
    const card = h('article.excard.glass' + (isOpen ? '.open' : ''), { style: { '--m': muscleColor(ex.muscle) } }, [
      h('div.excard-head', { onclick: () => { open = isOpen ? null : id; GT.app.rerender(); } }, [
        h('i.mbar'),
        // closed: just the name — details live inside
        // name + the change vs the session before, e.g. "Incline DB Press  +3%"
        h('div.excard-title.inline', [h('strong', ex.name), delta !== null ? h('span.delta.' + (delta >= 0 ? 'up' : 'down'), (delta > 0 ? '+' : '') + delta + '%') : null]),
        h('span.chev', icon(isOpen ? 'up' : 'down', 18))
      ])
    ]);
    if (!isOpen) return card;

    const histAll = filter(all, date);
    const hist = showAll === id ? histAll : histAll.slice(0, 8); // latest 8 unless expanded
    const body = h('div.excard-body');
    if (!hist.length) { body.append(h('p.muted.small', 'No sessions in this view.')); card.append(body); return card; }

    // all-time best set (latest one wins a tie), as in v1
    let best = { v: -1 };
    all.forEach((x) => x.sets.forEach((st, i) => { if (st.w * st.r >= best.v && st.w > 0) best = { v: st.w * st.r, date: x.date, i }; }));
    // only as many set columns as this exercise has ever had, so 4–5 sets fit without scrolling
    const cols = Math.max(1, ...all.map((x) => x.sets.length));
    const table = h('table.htable.aligned', [
      h('colgroup', [h('col.c-date'), ...Array.from({ length: cols }, () => h('col'))]),
      h('thead', h('tr', [h('th', ''), ...Array.from({ length: cols }, (_, i) => h('th', `S${i + 1}`))])),
      h('tbody', hist.map((x) => {
        const prev = all[all.indexOf(x) + 1];
        const trend = prev ? (vol(x) > vol(prev) ? 'up' : vol(x) < vol(prev) ? 'down' : '') : '';
        // tap a date to open that day in Activity
        // one line everywhere: "12 Nov" and "12×35" (reps×kg)
        return h('tr', [h('td.d' + (trend ? '.' + trend : ''), { onclick: () => GT.activity.openDate(x.date), title: 'Open in Activity' }, fmtDate(x.date)),
          ...Array.from({ length: cols }, (_, i) => { const st = x.sets[i]; return h('td' + (best.date === x.date && best.i === i ? '.best' : ''), st ? `${st.r}×${fmtW(st.w)}` : '—'); })]);
      }))
    ]);
    const pts = all.slice().reverse().map((x) => ({ x: fmtDate(x.date), y: vol(x), tip: `${fmtDate(x.date)} · ${fmtNum(vol(x))} ${S.s.settings.unit}` }));
    body.append(
      h('div.table-scroll', table),
      histAll.length > 8 ? h('button.link.showall', { onclick: () => { showAll = showAll === id ? null : id; GT.app.rerender(); } }, showAll === id ? 'Show latest 8' : `Show all ${histAll.length}`) : h('span'),

      lineChart(pts, { height: 110, unit: ' ' + S.s.settings.unit, empty: 'Log one more session to see a trend' })
    );
    card.append(body);
    return card;
  }

  GT.snapshot = { render };
})();
