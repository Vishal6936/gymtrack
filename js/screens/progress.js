/* Progress — three views (Body moved to its own screen behind More):
 *   Training : summary for a range, body map, completion (own range), weekly
 *              volume, one muscle's sets over time, completion by weekday,
 *              this month vs last, consistency heatmap (own range)
 *   Exercises: pick a muscle group (or search) → its PRs and exercises; tap an
 *              exercise for history, best weight per rep count, last trained
 *   Insights : top lifts, best week, PR timeline and more */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, fmtW, fmtDate, fmtNum, fmtDur, lineChart, barList, sparkline, ring, sheet, toast, confirm, prompt } = GT.ui;
  const S = GT.store;

  let tab = 'training'; let range = '30';
  let compRange = '30';    // completion chart: 30 | 60 | month | 100 | start
  let heatRange = '90';    // consistency heatmap: 30 | 60 | 90 | 365
  let trendMuscle = null;  // muscle shown in "sets over time"
  let exGroup = null;      // exercises tab: selected muscle group
  let exQuery = '';        // exercises tab: search text
  let prView = 'daily';    // insights PR card: daily | weekly | monthly

  function render(root, params) {
    if (params && params.tab) { tab = params.tab; params.tab = null; }
    root.append(
      h('header.top', [h('div.grow', [h('h1', 'Progress')])]),
      h('div.seg', [['training', 'Training'], ['exercises', 'Exercises'], ['insights', 'Insights']].map(([k, l]) => h('button' + (tab === k ? '.on' : ''), { onclick: () => { tab = k; GT.app.rerender(); } }, l)))
    );
    if (tab === 'exercises') exercises(root); else if (tab === 'insights') insights(root); else training(root);
  }

  // small dropdown used for per-card ranges
  const pick = (value, options, onChange) => h('select.mini-select', { onchange: (e) => onChange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  const weekOf = (d) => S.addDays(d, -((S.parseKey(d).getDay() + 6) % 7));

  // ---------- training ----------
  function training(root) {
    const t = S.todayKey();
    const firstLog = Object.keys(S.s.workouts).filter(S.hasWorkout).sort()[0] || t;
    const from = range === 'all' ? firstLog : S.addDays(t, -(Number(range) - 1));
    const st = S.rangeStats(from, t);
    const days = Math.max(1, (S.parseKey(t) - S.parseKey(from)) / 864e5 + 1); const weeks = Math.max(1, days / 7);

    // weekly volume + weekly sets per muscle, for the summary range
    const weekVol = {}; const weekMuscle = {};
    for (let d = from; d <= t; d = S.addDays(d, 1)) {
      const wk = weekOf(d); weekVol[wk] = weekVol[wk] || 0; weekMuscle[wk] = weekMuscle[wk] || {};
      const w = S.s.workouts[d]; if (!w) continue;
      w.entries.filter(S.entryLogged).forEach((e) => { const ds = S.doneSets(e); weekVol[wk] += S.volumeOf(ds); const m = S.ex(e.exId).muscle; weekMuscle[wk][m] = (weekMuscle[wk][m] || 0) + ds.length; });
    }
    const volPts = Object.entries(weekVol).map(([k, v]) => ({ x: fmtDate(k), y: v, tip: `Week of ${fmtDate(k)} · ${fmtNum(v)} ${S.s.settings.unit}` }));

    // completion chart has its own range
    const compFrom = compRange === 'start' ? firstLog : compRange === 'month' ? t.slice(0, 8) + '01' : S.addDays(t, -(Number(compRange) - 1));
    const comp = [];
    for (let d = compFrom; d <= t; d = S.addDays(d, 1)) { const c = S.completion(d); comp.push({ x: fmtDate(d), y: c, tip: `${fmtDate(d)} · ${c === null ? 'rest' : c + '%'}` }); }

    // one muscle's weekly sets over time (idea 3)
    const muscles = Object.entries(st.byMuscle).sort((x, y) => y[1] - x[1]).map(([m, v]) => ({ label: m, value: v / weeks, display: (v / weeks).toFixed(1) }));
    if (!trendMuscle || !S.s.muscles.includes(trendMuscle)) trendMuscle = muscles[0]?.label || 'Chest';
    const mPts = Object.entries(weekMuscle).map(([k, o]) => ({ x: fmtDate(k), y: o[trendMuscle] || 0, tip: `Week of ${fmtDate(k)} · ${o[trendMuscle] || 0} sets` }));

    // completion by weekday (idea 4): average of each weekday's completion in range
    const wd = S.DAYS.map((d) => ({ d, sum: 0, n: 0 }));
    for (let d = from; d <= t; d = S.addDays(d, 1)) { const c = S.completion(d); if (c !== null) { const i = (S.parseKey(d).getDay() + 6) % 7; wd[i].sum += c; wd[i].n++; } }

    // this month vs last month (same number of days)
    const mStart = t.slice(0, 8) + '01'; const pmEnd = S.addDays(mStart, -1); const pmStart = pmEnd.slice(0, 8) + '01';
    const dayOfMonth = Number(t.slice(8)); const pmSame = S.addDays(pmStart, Math.min(dayOfMonth, Number(pmEnd.slice(8))) - 1);
    const a = S.rangeStats(pmStart, pmSame), b = S.rangeStats(mStart, t);
    const pct = (x, y) => (x ? `${y >= x ? '+' : ''}${Math.round(((y - x) / x) * 100)}%` : '—');

    // ---- muscle-level analysis for the summary range ----
    const tracked = S.s.muscles.filter((m) => m !== 'Cardio' && m !== 'Other');
    const inRange = Object.values(S.s.workouts).filter((w) => w.date >= from && w.date <= t);
    // days each muscle was trained (at least one done set that day)
    const daysHit = {};
    inRange.forEach((w) => { const seen = new Set(); w.entries.filter(S.entryLogged).forEach((e) => { if (S.doneSets(e).length) seen.add(S.ex(e.exId).muscle); }); seen.forEach((m) => { daysHit[m] = (daysHit[m] || 0) + 1; }); });

    // 1. weekly sets per muscle vs the target band (default 10–20, editable)
    const band = S.s.settings.setTarget || { lo: 10, hi: 20 };
    const setRows = tracked.map((m) => ({ m, v: (st.byMuscle[m] || 0) / weeks })).filter((x) => x.v > 0 || daysHit[x.m]).sort((a, b) => b.v - a.v);
    const under = setRows.filter((x) => x.v < band.lo).length, over = setRows.filter((x) => x.v > band.hi).length;
    const bandCls = (v) => (v < band.lo ? 'band-low' : v > band.hi ? 'band-high' : 'band-ok');
    const bandTag = (v) => (v < band.lo ? 'low' : v > band.hi ? 'high' : 'ok');
    const editBand = async () => {
      const v = await prompt('Weekly sets target per muscle', `${band.lo}-${band.hi}`, 'e.g. 10-20');
      if (!v) return; const m = v.match(/(\d+)\D+(\d+)/);
      if (!m || +m[1] >= +m[2]) { toast('Use a range like 10-20', 'error'); return; }
      S.s.settings.setTarget = { lo: +m[1], hi: +m[2] }; S.save(); GT.app.rerender();
    };

    // 2. push / pull / legs balance (sets in range)
    const GROUPS = { Push: ['Chest', 'Shoulders', 'Triceps'], Pull: ['Back', 'Lats', 'Rear Delts', 'Biceps', 'Traps', 'Forearms'], Legs: ['Legs', 'Calves'] };
    const ppl = Object.entries(GROUPS).map(([g, ms]) => ({ g, n: ms.reduce((a, m) => a + (st.byMuscle[m] || 0), 0) }));
    const pplTotal = ppl.reduce((a, x) => a + x.n, 0);
    const pushN = ppl[0].n, pullN = ppl[1].n;
    const pplNote = !pplTotal ? '' : !pullN ? 'No pulling sets yet' : pushN / pullN > 1.25 ? 'More push than pull — add back / rear-delt work'
      : pullN / Math.max(1, pushN) > 1.5 ? 'Pull-heavy — fine for posture, keep an eye on chest/shoulders' : 'Push and pull are well balanced';

    // 3. how many times per week each muscle is trained
    const freqRows = tracked.filter((m) => daysHit[m]).map((m) => ({ m, v: daysHit[m] / weeks })).sort((a, b) => b.v - a.v);

    // 4. planned vs done sets (only days that count towards completion)
    let plannedSets = 0, doneSets = 0, cutShort = 0;
    inRange.forEach((w) => {
      if (S.completion(w.date) === null) return;
      w.planned.forEach((p, i) => {
        const goal = Number(p.sets) || 0; plannedSets += goal;
        const got = w.entries.filter((e) => e.planIdx === i).reduce((a, e) => a + S.doneSets(e).length, 0);
        doneSets += Math.min(goal, got);
        if (got > 0 && got < goal) cutShort++;
      });
    });
    const setsPct = plannedSets ? Math.round((doneSets / plannedSets) * 100) : 0;

    root.append(
      h('div.seg.mini.right', [['30', '30D'], ['90', '90D'], ['365', '1Y'], ['all', 'All']].map(([v, l]) => h('button' + (range === v ? '.on' : ''), { onclick: () => { range = v; GT.app.rerender(); } }, l))),
      h('section.kpis.four', [
        kpi(Math.round(st.completion), '%', 'completion'), kpi(st.workouts, '', 'workouts'), kpi(+(st.workouts / weeks).toFixed(1), '', 'per week', 1),
        kpi(st.workouts ? Math.round(st.volume / st.workouts) : '—', '', `${S.s.settings.unit} / workout`)
      ]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Consistency'), pick(heatRange, [['30', '30 days'], ['60', '60 days'], ['90', '90 days'], ['365', '365 days']], (v) => { heatRange = v; GT.app.rerender(); })]), heatmap(Number(heatRange))]),
      h('section.card.glass.wide-chart', [h('div.card-head', [h('h3', 'Completion'), pick(compRange, [['30', '30 days'], ['60', '60 days'], ['month', 'This month'], ['100', '100 days'], ['start', 'From start']], (v) => { compRange = v; GT.app.rerender(); })]),
        lineChart(comp, { min: 0, max: 100, height: 190, xLabels: true, unit: '%', empty: 'Not enough data in this range' })]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Weekly volume'), h('small.muted', S.s.settings.unit)]), lineChart(volPts, { min: 0, height: 130, xLabels: true, empty: 'Log a couple of weeks to see this' })]),
      // sets per muscle per week, coloured against the target band (tap the band to change it)
      h('section.card.glass', [h('div.card-head', [h('h3', 'Sets per muscle · week'), h('button.chip', { onclick: editBand, 'aria-label': 'Change target' }, `target ${band.lo}–${band.hi}`)]),
        setRows.length ? h('div.bars-wide', barList(setRows.map((x) => ({ label: x.m, value: x.v, cls: bandCls(x.v), display: `${x.v.toFixed(1)} ${bandTag(x.v)}` })))) : h('p.muted.small', 'Log some workouts to see this.'),
        setRows.length ? h('small.muted.block.card-foot', `${setRows.length - under - over} in range · ${under} below · ${over} above`) : null]),
      // push / pull / legs as one stacked bar
      h('section.card.glass', [h('div.card-head', [h('h3', 'Push · Pull · Legs'), h('small.muted', `${fmtNum(pplTotal)} sets`)]),
        pplTotal ? h('div.ppl', [
          h('div.ppl-bar', ppl.map((x, i) => h('i.ppl-' + i, { style: { flex: x.n || 0.0001 } }))),
          h('div.ppl-legend', ppl.map((x, i) => h('span', [h('i.dot.ppl-' + i), `${x.g} `, h('strong.mono', Math.round((x.n / pplTotal) * 100) + '%')]))),
          h('small.muted.block', `Push : Pull = ${pullN ? (pushN / pullN).toFixed(2) : '—'} · ${pplNote}`)
        ]) : h('p.muted.small', 'Log some workouts to see this.')]),
      // times per week each muscle gets trained
      h('section.card.glass', [h('div.card-head', [h('h3', 'Times trained per week'), h('small.muted', 'per muscle')]),
        freqRows.length ? barList(freqRows.map((x) => ({ label: x.m, value: x.v, display: x.v.toFixed(1) + '×' }))) : h('p.muted.small', 'Log some workouts to see this.')]),
      // planned sets vs sets actually done
      h('section.card.glass', [h('div.card-head', [h('h3', 'Planned vs done sets'), h('small.muted', 'planned days')]),
        plannedSets ? [
          h('div.grid3', [mini(fmtNum(plannedSets), 'planned'), mini(fmtNum(doneSets), 'done'), mini(setsPct + '%', 'of plan')]),
          h('div.goal-bar', [h('div', h('b', { style: { width: Math.min(100, setsPct) + '%' } })), h('small.muted.mono', setsPct + '%')]),
          h('small.muted.block.card-foot', cutShort ? `${cutShort} time${cutShort > 1 ? 's' : ''} an exercise stopped short of its planned sets` : 'Every started exercise got all its planned sets')
        ] : h('p.muted.small', 'No planned days in this range yet.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Completion by weekday'), h('small.muted', 'average')]),
        barList(wd.map((x) => ({ label: x.d.slice(0, 3), value: x.n ? x.sum / x.n : 0, display: x.n ? Math.round(x.sum / x.n) + '%' : '—' })))]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'This month vs last'), h('small.muted', `first ${dayOfMonth} days`)]),
        h('div.compare', [['Workouts', a.workouts, b.workouts], ['Sets', a.sets, b.sets], ['Volume', a.volume, b.volume]].map(([l, x, y]) => h('div.cmp-row', [h('span', l), h('span.mono.muted', fmtNum(x)), h('span.mono', fmtNum(y)), h('span.mono.' + (y >= x ? 'up' : 'down'), pct(x, y))])))])
    );
  }
  const kpi = (v, suffix, l, dec = 0) => h('div.card.glass.kpi', [GT.ui.num(v, suffix, dec), h('small', l)]);

  // Front + back body outline. Each region lights up in the accent colour in
  // proportion to the sets that muscle got per week in the selected range.
  function bodyMap(byMuscle, weeks) {
    const per = {}; Object.entries(byMuscle).forEach(([m, v]) => { per[m] = v / weeks; });
    const max = Math.max(1, ...Object.values(per));
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, a, muscle) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); e.setAttribute('class', muscle ? 'part' : 'head');
      if (muscle) { const v = per[muscle] || 0; if (v) { e.style.fill = 'var(--accent)'; e.style.fillOpacity = (0.12 + 0.78 * (v / max)).toFixed(2); e.style.stroke = 'var(--accent)'; e.style.strokeOpacity = 0.5; }
        const t = document.createElementNS(NS, 'title'); t.textContent = `${muscle}: ${v ? v.toFixed(1) : 0} sets/wk`; e.append(t); }
      return e; };
    const ell = (cx, cy, rx, ry, m) => mk('ellipse', { cx, cy, rx, ry }, m);
    const rect = (x, y, w, hh, m, r = 6) => mk('rect', { x, y, width: w, height: hh, rx: r }, m);
    const poly = (pts, m) => mk('polygon', { points: pts }, m);
    const side = (back) => {
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 120 250');
      svg.append(mk('circle', { cx: 60, cy: 18, r: 12 }), rect(53, 29, 14, 8, null, 3));
      if (!back) {
        svg.append(ell(36, 50, 10, 9, 'Shoulders'), ell(84, 50, 10, 9, 'Shoulders'),
          rect(41, 43, 18.5, 22, 'Chest', 7), rect(60.5, 43, 18.5, 22, 'Chest', 7),
          rect(46, 68, 28, 42, 'Abs', 7), ell(29, 76, 7, 15, 'Biceps'), ell(91, 76, 7, 15, 'Biceps'),
          ell(24, 108, 6, 16, 'Forearms'), ell(96, 108, 6, 16, 'Forearms'), rect(43, 112, 34, 14, null, 6),
          ell(49, 154, 10.5, 28, 'Legs'), ell(71, 154, 10.5, 28, 'Legs'), ell(49, 212, 7.5, 21, 'Calves'), ell(71, 212, 7.5, 21, 'Calves'));
      } else {
        svg.append(poly('46,36 74,36 82,47 60,54 38,47', 'Traps'), ell(35, 51, 9.5, 8.5, 'Rear Delts'), ell(85, 51, 9.5, 8.5, 'Rear Delts'),
          rect(45, 52, 30, 22, 'Back', 6), poly('41,56 47,58 52,98 43,90', 'Lats'), poly('79,56 73,58 68,98 77,90', 'Lats'), rect(49, 92, 22, 18, 'Back', 5),
          ell(29, 76, 7, 15, 'Triceps'), ell(91, 76, 7, 15, 'Triceps'), ell(24, 108, 6, 16, 'Forearms'), ell(96, 108, 6, 16, 'Forearms'),
          ell(50, 122, 10, 10, 'Legs'), ell(70, 122, 10, 10, 'Legs'), ell(49, 160, 10, 24, 'Legs'), ell(71, 160, 10, 24, 'Legs'),
          ell(49, 214, 7.5, 20, 'Calves'), ell(71, 214, 7.5, 20, 'Calves'));
      }
      return svg;
    };
    return h('div.bodymap', [h('div', [side(false), h('small.block', 'FRONT')]), h('div', [side(true), h('small.block', 'BACK')])]);
  }

  // Grid of weeks × 7 days covering the chosen number of days; intensity = completion.
  function heatmap(nDays) {
    const t = S.todayKey(); const end = S.addDays(t, 6 - ((S.parseKey(t).getDay() + 6) % 7));
    const wks = Math.ceil(nDays / 7); const start = S.addDays(end, -7 * wks + 1);
    const grid = h('div.heat' + (wks <= 14 ? '.wide' : ''));
    for (let d = start; d <= end; d = S.addDays(d, 1)) {
      const st = S.dayStatus(d); const c = S.completion(d);
      grid.append(h('i.' + st, { title: `${fmtDate(d)} · ${st}`, style: { '--c': st === 'logged' ? Math.max(0.35, (c ?? 100) / 100) : 0 } }));
    }
    return h('div.heat-scroll', grid);
  }

  // ---------- insights ----------
  // Six answers to "what should I change?", all for the range chosen at the top.
  function insights(root) {
    const t = S.todayKey();
    const firstLog = Object.keys(S.s.workouts).filter(S.hasWorkout).sort()[0] || t;
    const from = range === 'all' ? firstLog : S.addDays(t, -(Number(range) - 1));
    const inRange = Object.values(S.s.workouts).filter((w) => w.date >= from && w.date <= t).sort((a, b) => a.date.localeCompare(b.date));
    const unit = S.s.settings.unit;

    // 1. most skipped planned exercises (only days that counted towards completion)
    const planned = {}, skipped = {};
    inRange.forEach((w) => { if (S.completion(w.date) === null) return; w.planned.forEach((p, i) => { planned[p.exId] = (planned[p.exId] || 0) + 1; if (!w.entries.some((e) => e.planIdx === i && S.entryLogged(e))) skipped[p.exId] = (skipped[p.exId] || 0) + 1; }); });
    const skipRows = Object.keys(skipped).map((id) => ({ id, n: skipped[id], of: planned[id] })).sort((a, b) => b.n / b.of - a.n / a.of || b.n - a.n).slice(0, 5);

    // 2. most swapped: original → replacement
    const swaps = {};
    inRange.forEach((w) => w.entries.forEach((e) => { if (e.swappedFrom && S.entryLogged(e)) { const k = e.swappedFrom + '>' + e.exId; swaps[k] = (swaps[k] || 0) + 1; } }));
    const swapRows = Object.entries(swaps).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // 3. top 3 lifts by best estimated 1RM (3+ sessions), trend on one chart
    const lifts = Object.values(S.s.exercises).map((ex) => { const hst = S.history(ex.id).filter((x) => x.date >= from); return { ex, hst, best: hst.length ? Math.max(...hst.flatMap((x) => x.sets.map((st) => S.e1rm(st.w, st.r)))) : 0 }; })
      .filter((x) => x.hst.length >= 3).sort((a, b) => b.best - a.best).slice(0, 3);
    const colors = ['var(--accent)', 'var(--hl)', 'rgba(255,255,255,.55)'];
    const series = lifts.map((x, i) => ({ name: x.ex.name, color: colors[i], pts: x.hst.map((d) => ({ k: d.date, y: Math.round(Math.max(...d.sets.map((st) => S.e1rm(st.w, st.r)))) })) }));

    // 4. PR timeline: every session that beat that exercise's previous best e1RM
    const bestSoFar = {}; const prsAll = [];
    Object.values(S.s.workouts).sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => w.entries.filter(S.entryLogged).forEach((e) => {
      const top = S.doneSets(e).reduce((b, st) => (S.e1rm(+st.w, +st.r) > (b ? S.e1rm(+b.w, +b.r) : -1) ? st : b), null); if (!top) return;
      const v = S.e1rm(+top.w, +top.r);
      if (bestSoFar[e.exId] !== undefined && v > bestSoFar[e.exId]) prsAll.push({ date: w.date, id: e.exId, w: +top.w, r: +top.r, e: v });
      bestSoFar[e.exId] = Math.max(bestSoFar[e.exId] ?? -1, v);
    }));
    const prs = prsAll.filter((p) => p.date >= from);
    const monthPRs = prs.filter((p) => p.date.slice(0, 7) === t.slice(0, 7)).length;
    // PRs grouped into weeks or months (best PR per exercise in each period)
    const prGroups = (keyOf, labelOf) => {
      const g = {}; prs.forEach((p) => { const k = keyOf(p.date); g[k] = g[k] || {}; if (!g[k][p.id] || p.e > g[k][p.id].e) g[k][p.id] = p; });
      return Object.keys(g).sort().reverse().map((k) => ({ k, label: labelOf(k), items: Object.values(g[k]).sort((a, b) => b.e - a.e) }));
    };
    const monthName = (k) => S.parseKey(k + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const prBody = () => {
      if (!prs.length) return h('p.muted.small', 'No new records in this range yet.');
      if (prView === 'daily') return h('div.daylist', prs.slice(-12).reverse().map((p) => h('button.dayrow', { onclick: () => detail(p.id) }, [h('span.mono.muted.prdate', fmtDate(p.date)), h('div.grow', h('strong', S.ex(p.id).name)), h('span.mono.small', `${fmtW(p.w)}×${p.r}`)])));
      const groups = prView === 'weekly' ? prGroups(weekOf, (k) => `Week of ${fmtDate(k)}`) : prGroups((d) => d.slice(0, 7), monthName);
      return h('div.daylist', groups.slice(0, 12).map((gp) => h('div.pr-period', [
        h('div.row.between', [h('strong', gp.label), h('span.pill', `${gp.items.length} PR${gp.items.length > 1 ? 's' : ''}`)]),
        h('div.chips.tight', gp.items.map((p) => h('button.chip.sm', { onclick: () => detail(p.id) }, [S.ex(p.id).name, h('span.mono.muted', ` ${fmtW(p.w)}×${p.r}`)])))
      ])));
    };
    const prWrap = h('div.pr-wrap');
    const drawPR = () => { prWrap.innerHTML = ''; GT.ui.append(prWrap, [
      h('div.seg.mini', [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => h('button' + (prView === k ? '.on' : ''), { onclick: () => { prView = k; drawPR(); } }, l))),
      prBody()]); };
    drawPR();

    // PRs per month, last 12 months (all history, not the range)
    const months = []; for (let i = 11; i >= 0; i--) { const d = S.parseKey(t.slice(0, 8) + '01'); d.setMonth(d.getMonth() - i); months.push(S.dateKey(d).slice(0, 7)); }
    const prMonthly = months.map((m) => ({ m, n: prsAll.filter((p) => p.date.slice(0, 7) === m).length }));
    const prMax = Math.max(1, ...prMonthly.map((x) => x.n));

    // neglected muscles: trained before, but not in the last 10+ days
    const lastHit = {};
    Object.values(S.s.workouts).forEach((w) => w.entries.filter(S.entryLogged).forEach((e) => { if (!S.doneSets(e).length) return; const m = S.ex(e.exId).muscle; if (!lastHit[m] || w.date > lastHit[m]) lastHit[m] = w.date; }));
    const daysSince = (d) => Math.round((S.parseKey(t) - S.parseKey(d)) / 864e5);
    const neglected = Object.entries(lastHit).filter(([m]) => m !== 'Cardio' && m !== 'Other').map(([m, d]) => ({ m, n: daysSince(d) })).filter((x) => x.n >= 10).sort((a, b) => b.n - a.n);

    // strength relative to bodyweight (latest logged weight)
    const wDates = Object.keys(S.s.body.logs).filter((d) => Number(S.s.body.logs[d].Weight) > 0).sort();
    const bw = wDates.length ? Number(S.s.body.logs[wDates[wDates.length - 1]].Weight) : null;
    const relRows = bw ? Object.values(S.s.exercises).map((ex) => { const p = S.prFor(ex.id); return p && p.sessions >= 3 ? { ex, v: p.best1rm.v / bw } : null; }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 6) : [];

    // weekly stats used by the summary + deload check
    const wkStats = (start, end) => {
      const r = S.rangeStats(start, end);
      return { ...r, prs: prsAll.filter((p) => p.date >= start && p.date <= end).length };
    };
    const thisMon = weekOf(t); const dow = daysSince(thisMon);
    const cur = wkStats(thisMon, t), prev = wkStats(S.addDays(thisMon, -7), S.addDays(thisMon, -7 + dow)); // last week, same days so far
    const skippedThisWeek = {};
    Object.values(S.s.workouts).filter((w) => w.date >= thisMon && w.date < t && S.completion(w.date) !== null)
      .forEach((w) => w.planned.forEach((p, i) => { if (!w.entries.some((e) => e.planIdx === i && S.entryLogged(e))) skippedThisWeek[p.exId] = (skippedThisWeek[p.exId] || 0) + 1; }));
    const skipTop = Object.entries(skippedThisWeek).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const delta = (a, b) => (a ? `${b >= a ? '+' : ''}${Math.round(((b - a) / a) * 100)}%` : b ? 'new' : '—');
    const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;

    // deload check: last 2 full weeks vs the 2 before — volume up while completion or strength slips
    const W = (k) => { const s0 = S.addDays(thisMon, -7 * k); return wkStats(s0, S.addDays(s0, 6)); };
    const [w1, w2, w3, w4] = [W(1), W(2), W(3), W(4)];
    const volRecent = w1.volume + w2.volume, volBefore = w3.volume + w4.volume;
    const compRecent = (w1.completion + w2.completion) / 2, compBefore = (w3.completion + w4.completion) / 2;
    const strengthDown = (() => { // exercises whose best e1RM fell from weeks 3–4 to weeks 1–2
      const best = (a, b) => { const o = {}; Object.values(S.s.workouts).filter((w) => w.date >= a && w.date <= b).forEach((w) => w.entries.filter(S.entryLogged).forEach((e) => { const v = Math.max(0, ...S.doneSets(e).map((st) => S.e1rm(+st.w, +st.r))); o[e.exId] = Math.max(o[e.exId] || 0, v); })); return o; };
      const before = best(S.addDays(thisMon, -28), S.addDays(thisMon, -15)), recent = best(S.addDays(thisMon, -14), S.addDays(thisMon, -1));
      const both = Object.keys(recent).filter((k) => before[k]); return { down: both.filter((k) => recent[k] < before[k] * 0.98).length, of: both.length };
    })();
    const enoughData = w4.workouts && w1.workouts;
    const volUp = volBefore && volRecent > volBefore * 1.1;
    const slipping = compBefore - compRecent >= 10 || (strengthDown.of >= 3 && strengthDown.down / strengthDown.of >= 0.5);
    const deload = enoughData && volUp && slipping;


    // 5. rep ranges
    const buckets = [['1–5', 1, 5], ['6–10', 6, 10], ['11–15', 11, 15], ['15+', 16, 999]].map(([l, lo, hi]) => ({ l, n: 0, lo, hi }));
    let totalSets = 0;
    inRange.forEach((w) => w.entries.forEach((e) => S.doneSets(e).forEach((st) => { totalSets++; const b = buckets.find((x) => +st.r >= x.lo && +st.r <= x.hi); if (b) b.n++; })));

    // 6. best week ever (all history) vs this week
    const weeks = {};
    Object.values(S.s.workouts).forEach((w) => { const wk = weekOf(w.date); weeks[wk] = weeks[wk] || { vol: 0, comp: [], k: wk };
      weeks[wk].vol += w.entries.filter(S.entryLogged).reduce((a, e) => a + S.volumeOf(S.doneSets(e)), 0); const c = S.completion(w.date); if (c !== null) weeks[wk].comp.push(c); });
    const wl = Object.values(weeks).map((x) => ({ ...x, avg: x.comp.length ? x.comp.reduce((a, b) => a + b, 0) / x.comp.length : 0 }));
    const bestVol = wl.slice().sort((a, b) => b.vol - a.vol)[0]; const bestComp = wl.slice().sort((a, b) => b.avg - a.avg || b.vol - a.vol)[0];
    const thisWk = weeks[weekOf(t)] || { vol: 0 }; const pctOfBest = bestVol && bestVol.vol ? Math.round((thisWk.vol / bestVol.vol) * 100) : 0;

    root.append(
      h('div.seg.mini.right', [['30', '30D'], ['90', '90D'], ['365', '1Y'], ['all', 'All']].map(([v, l]) => h('button' + (range === v ? '.on' : ''), { onclick: () => { range = v; GT.app.rerender(); } }, l))),
      // this week so far vs the same days of last week
      h('section.card.glass', [h('div.card-head', [h('h3', 'This week vs last'), h('small.muted', `${dow + 1} day${dow ? 's' : ''} each`)]),
        h('div.compare', [['Workouts', prev.workouts, cur.workouts, signed(cur.workouts - prev.workouts)], ['Sets', prev.sets, cur.sets, delta(prev.sets, cur.sets)], ['Volume', prev.volume, cur.volume, delta(prev.volume, cur.volume)], ['PRs', prev.prs, cur.prs, signed(cur.prs - prev.prs)]]
          .map(([l, x, y, d]) => h('div.cmp-row', [h('span', l), h('span.mono.muted', fmtNum(x)), h('span.mono', fmtNum(y)), h('span.mono.' + (y >= x ? 'up' : 'down'), d)]))),
        h('small.muted.block.card-foot', skipTop.length ? `Skipped this week: ${skipTop.map(([id, n]) => S.ex(id).name + (n > 1 ? ` ×${n}` : '')).join(', ')}` : 'Nothing skipped this week so far.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Best week'), h('small.muted', 'all time')]),
        bestVol ? h('div.bestweek', [
          h('div', [h('small.eyebrow', 'Volume'), GT.ui.num(Math.round(bestVol.vol), ' ' + unit, 0, 'strong.mono'), h('small.muted', `week of ${fmtDate(bestVol.k)}`)]),
          h('div', [h('small.eyebrow', 'Completion'), GT.ui.num(Math.round(bestComp.avg), '%', 0, 'strong.mono'), h('small.muted', `week of ${fmtDate(bestComp.k)}`)])
        ]) : h('p.muted.small', 'No weeks logged yet.'),
        bestVol ? h('div.goal-bar', [h('div', h('b', { style: { width: Math.min(100, pctOfBest) + '%' } })), h('small.muted.mono', `This week ${pctOfBest}% of best`)]) : null]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Top lifts'), h('small.muted', 'est. 1RM')]),
        series.length ? GT.ui.multiLine(series, { empty: 'Needs 3+ sessions of an exercise' }) : h('p.muted.small', 'Needs 3+ sessions of an exercise in this range.')]),
      // PRs with a Daily / Weekly / Monthly switch (daily by default)
      h('section.card.glass', [h('div.card-head', [h('h3', 'Personal records'), h('small.muted', `${monthPRs} this month`)]), prWrap]),
      // PR count per month, last 12 months
      h('section.card.glass', [h('div.card-head', [h('h3', 'PRs per month'), h('small.muted', 'last 12 months')]),
        prsAll.length ? h('div.colchart', prMonthly.map((x) => h('div', { title: `${monthName(x.m)} · ${x.n} PRs` }, [h('small.mono', x.n || ''), h('i', h('b', { style: { height: (x.n / prMax) * 100 + '%' } })), h('small', S.parseKey(x.m + '-01').toLocaleDateString(undefined, { month: 'narrow' }))]))) : h('p.muted.small', 'No records yet.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Most skipped'), h('small.muted', 'of times planned')]),
        skipRows.length ? barList(skipRows.map((x) => ({ label: S.ex(x.id).name, value: x.n / x.of, display: `${x.n}/${x.of}` }))) : h('p.muted.small', 'Nothing skipped — every planned exercise got done.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Most swapped'), h('small.muted', 'times')]),
        swapRows.length ? h('div.daylist', swapRows.map(([k, n]) => { const [a, b] = k.split('>'); return h('div.dayrow', [h('div.grow', [h('strong', S.ex(a).name), h('small.muted.block', `→ ${S.ex(b).name}`)]), h('span.mono', `${n}×`)]); })) : h('p.muted.small', 'No swaps in this range.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Rep ranges'), h('small.muted', `${totalSets} sets`)]),
        barList(buckets.map((b) => ({ label: b.l + ' reps', value: b.n, display: totalSets ? Math.round((b.n / totalSets) * 100) + '%' : '—' })))]),
      // muscles that have gone quiet
      h('section.card.glass', [h('div.card-head', [h('h3', 'Neglected muscles'), h('small.muted', '10+ days')]),
        neglected.length ? h('div.daylist', neglected.map((x) => h('div.dayrow', { style: { '--m': muscleColor(x.m) } }, [h('div.grow', h('strong', x.m)), h('span.mono.small', `${x.n} days`)]))) : h('p.muted.small', 'Every muscle you train was hit in the last 10 days.')]),
      // best e1RM ÷ latest bodyweight
      h('section.card.glass', [h('div.card-head', [h('h3', 'Strength vs bodyweight'), h('small.muted', bw ? `at ${fmtW(bw)} ${unit}` : 'e1RM ÷ weight')]),
        !bw ? h('p.muted.small', 'Log your weight in Body to see this.') : relRows.length ? h('div.bars-wide', barList(relRows.map((x) => ({ label: x.ex.name, value: x.v, display: x.v.toFixed(2) + '× BW' })))) : h('p.muted.small', 'Needs 3+ sessions of an exercise.')]),
      // deload check
      h('section.card.glass', [h('div.card-head', [h('h3', 'Deload check'), h('span.pill' + (deload ? '.warn' : ''), !enoughData ? 'needs 4 weeks' : deload ? 'consider a deload' : 'all good')]),
        enoughData ? h('div.compare', [
          ['Volume', fmtNum(volBefore), fmtNum(volRecent), delta(volBefore, volRecent), volRecent >= volBefore],
          ['Completion', Math.round(compBefore) + '%', Math.round(compRecent) + '%', signed(Math.round(compRecent - compBefore)), compRecent >= compBefore],
          ['Lifts down', '', `${strengthDown.down}/${strengthDown.of}`, '', strengthDown.down * 2 < strengthDown.of || !strengthDown.of]
        ].map(([l, x, y, d, good]) => h('div.cmp-row', [h('span', l), h('span.mono.muted', x), h('span.mono', y), h('span.mono.' + (good ? 'up' : 'down'), d)]))) : null,
        h('small.muted.block.card-foot', !enoughData ? 'Compares your last 2 weeks with the 2 before once you have 4 weeks logged.'
          : deload ? 'Volume is climbing while completion or strength is slipping. A lighter week (about half the sets) usually helps you bounce back.'
          : 'Last 2 weeks vs the 2 before. Volume and performance are moving together.')])
    );
  }

  // ---------- exercises ----------
  // Muscle group first (no endless list), or search across everything.
  function exerciseRows() {
    return Object.values(S.s.exercises).map((ex) => {
      const hist = S.history(ex.id); if (!hist.length) return null;
      const series = hist.slice(0, 8).reverse().map((x) => Math.max(...x.sets.map((st) => S.e1rm(st.w, st.r))));
      const last4 = series.slice(-4); const prev4 = series.slice(-8, -4);
      const plateau = prev4.length >= 2 && last4.length === 4 && Math.max(...last4) <= Math.max(...prev4);
      return { ex, hist, pr: S.prFor(ex.id), series, plateau };
    }).filter(Boolean).sort((a, b) => b.hist[0].date.localeCompare(a.hist[0].date));
  }
  const groupOf = (ex) => (S.s.muscles.includes(ex.muscle) && ex.muscle !== 'Other' ? ex.muscle : 'Uncategorised');

  function exercises(root) {
    const rows = exerciseRows();
    const listWrap = h('div');
    const search = h('input.field.search', { type: 'search', placeholder: 'Search exercises', value: exQuery });
    const draw = () => {
      listWrap.innerHTML = '';
      const q = S.canon(exQuery);
      if (q) { GT.ui.append(listWrap, h('section.card.glass', rows.filter((x) => S.canon(x.ex.name).includes(q)).map(exRow))); return; }
      if (!exGroup) {
        const groups = {}; rows.forEach((x) => { const g = groupOf(x.ex); groups[g] = (groups[g] || 0) + 1; });
        const order = [...S.s.muscles.filter((m) => groups[m] && m !== 'Other'), ...(groups.Uncategorised ? ['Uncategorised'] : [])];
        GT.ui.append(listWrap, h('section.card.glass.list', order.length ? order.map((g) => h('button.set-row', { onclick: () => { exGroup = g; draw(); } }, [h('div.grow', [h('strong', g), h('small.muted.block', `${groups[g]} exercise${groups[g] > 1 ? 's' : ''}`)]), icon('right', 18)])) : h('p.muted', 'Log some workouts and your exercises will appear here.')));
        return;
      }
      const inGroup = rows.filter((x) => groupOf(x.ex) === exGroup);
      const prs = inGroup.slice().sort((a, b) => b.pr.best1rm.v - a.pr.best1rm.v).slice(0, 4);
      GT.ui.append(listWrap, [
        h('button.back-row', { onclick: () => { exGroup = null; draw(); } }, [icon('left', 18), h('span', 'All muscle groups'), h('strong', exGroup)]),
        prs.length ? h('div.pr-grid', prs.map((x) => h('button.card.glass.pr', { onclick: () => detail(x.ex.id) }, [h('small.eyebrow', 'Best'), h('strong', x.ex.name), h('span.mono', `${x.pr.maxW.r} × ${fmtW(x.pr.maxW.v)} ${S.s.settings.unit}`), h('small', `e1RM ${fmtW(x.pr.best1rm.v)}`)]))) : null,
        h('section.card.glass', inGroup.map(exRow))
      ]);
    };
    search.addEventListener('input', () => { exQuery = search.value; draw(); });
    root.append(search, listWrap);
    draw();
  }
  const exRow = (x) => h('button.exrow', { onclick: () => detail(x.ex.id) }, [
    h('div.grow', [h('strong', x.ex.name), h('small.muted.block', `${x.hist.length} sessions · last ${fmtDate(x.hist[0].date)}`)]),
    x.plateau ? h('span.pill.warn', 'Plateau') : null, sparkline(x.series, 'var(--accent)')
  ]);

  function detail(id) {
    const ex = S.ex(id); const hist = S.history(id).slice().reverse(); const pr = S.prFor(id);
    const lastDate = hist[hist.length - 1].date; const ago = Math.round((S.parseKey(S.todayKey()) - S.parseKey(lastDate)) / 864e5);
    // best weight lifted for at least N reps (idea 1)
    const repBest = [6, 8, 10, 12].map((n) => { let best = null; hist.forEach((x) => x.sets.forEach((st) => { if (st.r >= n && (!best || st.w > best.w)) best = { w: st.w, r: st.r, date: x.date }; })); return [n, best]; });
    // --- extra analysis (oldest → newest in `hist`) ---
    const sessBest = hist.map((x) => ({ date: x.date, e: Math.max(...x.sets.map((st) => S.e1rm(st.w, st.r))), vol: x.sets.reduce((a, st) => a + st.w * st.r, 0) }));
    // progress rate: least-squares slope of session-best e1RM over time, as % of the average per 30 days
    let ratePerMonth = null;
    const spanDays = sessBest.length ? (S.parseKey(sessBest[sessBest.length - 1].date) - S.parseKey(sessBest[0].date)) / 864e5 : 0;
    if (sessBest.length >= 3 && spanDays >= 14) {
      const xs = sessBest.map((x) => (S.parseKey(x.date) - S.parseKey(sessBest[0].date)) / 864e5), ys = sessBest.map((x) => x.e);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
      ratePerMonth = my ? (slope * 30 / my) * 100 : null;
    }
    // last e1RM PR: the latest session that beat every session before it (first session = baseline)
    let runBest = -1, lastPR = null;
    sessBest.forEach((x, i) => { if (x.e > runBest) { if (i > 0) lastPR = x.date; runBest = x.e; } });
    const prAgo = lastPR ? Math.round((S.parseKey(S.todayKey()) - S.parseKey(lastPR)) / 864e5) : null;
    const sessionsSincePR = lastPR ? sessBest.filter((x) => x.date > lastPR).length : sessBest.length - 1;
    const bestVol = sessBest.reduce((b, x) => (x.vol > b.vol ? x : b), { vol: -1 });
    // next-target hint: planned reps for this exercise (if it's in the plan), else last session's reps
    const planItem = Object.values(S.s.plan).flatMap((p) => p.items).find((it) => it.exId === id);
    const lastSess = hist[hist.length - 1]; const work = lastSess.sets.filter((st) => st.t !== 'w'); const ws = work.length ? work : lastSess.sets;
    const targetReps = planItem ? planItem.reps : Math.max(...ws.map((st) => st.r));
    const sug = S.suggestion(id, targetReps, S.addDays(S.todayKey(), 1));
    const topW = Math.max(...ws.map((st) => st.w));
    const hint = sug ? `Try ${fmtW(sug.w)} ${S.s.settings.unit} — ${sug.reason.toLowerCase()}.`
      : `Stay at ${fmtW(topW)} ${S.s.settings.unit} and aim for ${targetReps} reps on every set, then add ${S.s.settings.progression} ${S.s.settings.unit}.`;
    const plateauNote = sessionsSincePR >= 4 ? `No new best in ${sessionsSincePR} sessions${lastPR ? ` (last PR ${fmtDate(lastPR)})` : ''} — try a rep-range change or a variation.` : null;

    let metric = 'top';
    const wrap = h('div');
    const draw = () => {
      wrap.innerHTML = '';
      const val = (x) => metric === 'e1rm' ? Math.max(...x.sets.map((st) => S.e1rm(st.w, st.r))) : metric === 'top' ? Math.max(...x.sets.map((st) => st.w)) : x.sets.reduce((a, st) => a + st.w * st.r, 0);
      GT.ui.append(wrap, [
        h('div.grid3', [mini(String(pr.sessions), 'sessions'), mini(ago === 0 ? 'Today' : ago === 1 ? '1 day' : `${ago} days`, 'since last'), mini(fmtW(pr.best1rm.v), 'best e1RM')]),
        h('div.grid3', [
          mini(ratePerMonth === null ? '—' : `${ratePerMonth >= 0 ? '+' : ''}${ratePerMonth.toFixed(1)}%`, 'e1RM / month'),
          mini(prAgo === null ? '—' : prAgo === 0 ? 'Today' : prAgo === 1 ? '1 day' : `${prAgo} days`, 'since last PR'),
          mini(fmtW(Math.round(bestVol.vol)), `best session ${S.s.settings.unit}`)
        ]),
        h('div.ex-note', [h('small.eyebrow', 'Next target'), h('span', hint)]),
        plateauNote ? h('div.ex-note.warn', [h('small.eyebrow', 'Plateau'), h('span', plateauNote)]) : null,
        h('div.seg.mini', [['top', 'Top set'], ['e1rm', 'Est. 1RM'], ['vol', 'Volume']].map(([k, l]) => h('button' + (metric === k ? '.on' : ''), { onclick: () => { metric = k; draw(); } }, l))),
        lineChart(hist.map((x) => ({ x: fmtDate(x.date), y: val(x), tip: `${fmtDate(x.date)} · ${fmtW(val(x))} ${S.s.settings.unit}` })), { height: 150, xLabels: true }),
        h('p.section-label', 'Best weight by reps'),
        h('div.repbest', repBest.map(([n, b]) => h('div', [h('small', `${n}+ reps`), h('strong.mono', b ? `${fmtW(b.w)}` : '—'), h('small.muted', b ? fmtDate(b.date) : '')]))),
        h('p.section-label', 'Best set ever'),
        h('div.ex-note', [h('strong.mono', `${fmtW(pr.bestSet.w)} ${S.s.settings.unit} × ${pr.bestSet.r}`), h('small.muted', `${fmtW(pr.bestSet.v)} ${S.s.settings.unit} in one set · ${fmtDate(pr.bestSet.date)}`)]),
        h('p.section-label', 'Last 3 sessions'),
        h('div.last3', hist.slice(-3).reverse().map((x) => h('div', [h('small.muted', fmtDate(x.date)), ...x.sets.map((st) => h('span.mono.small', `${st.r}×${fmtW(st.w)}`))]))), // reps×weight, same as History
        h('p.section-label', 'History'),
        h('div.daylist', hist.slice().reverse().slice(0, 30).map((x) => h('div.dayrow', [h('span.muted', fmtDate(x.date, { day: 'numeric', month: 'short', year: '2-digit' })), h('span.mono.small.sets', x.sets.map((st) => `${st.r}×${fmtW(st.w)}`).join('  '))])))
      ]);
    };
    draw();
    sheet(ex.name, wrap, { full: true });
  }
  const mini = (v, l) => h('div.mini-stat', [h('strong.mono', v), h('small', l)]);

  GT.progress = { render };
})();
