/* Progress — three views:
 *   Training : summary for a range, body map, completion (own range), weekly
 *              volume, one muscle's sets over time, completion by weekday,
 *              this month vs last, consistency heatmap (own range)
 *   Exercises: pick a muscle group (or search) → its PRs and exercises; tap an
 *              exercise for history, best weight per rep count, last trained
 *   Body     : measurements with goal bars, trend chart (+7-day avg for weight),
 *              left-vs-right */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, muscleColor, fmtW, fmtDate, fmtNum, fmtDur, lineChart, barList, sparkline, ring, sheet, toast, confirm, prompt } = GT.ui;
  const S = GT.store;

  let tab = 'training'; let range = '30'; let bodyDate = null; let bodyPart = 'Weight';
  let compRange = '30';    // completion chart: 30 | 60 | month | 100 | start
  let heatRange = '90';    // consistency heatmap: 30 | 60 | 90 | 365
  let trendMuscle = null;  // muscle shown in "sets over time"
  let exGroup = null;      // exercises tab: selected muscle group
  let exQuery = '';        // exercises tab: search text

  function render(root, params) {
    if (params && params.tab) { tab = params.tab; params.tab = null; }
    root.append(
      h('header.top', [h('div.grow', [h('h1', 'Progress')])]),
      h('div.seg', [['training', 'Training'], ['exercises', 'Exercises'], ['insights', 'Insights'], ['body', 'Body']].map(([k, l]) => h('button' + (tab === k ? '.on' : ''), { onclick: () => { tab = k; GT.app.rerender(); } }, l)))
    );
    if (tab === 'training') training(root); else if (tab === 'exercises') exercises(root); else if (tab === 'insights') insights(root); else body(root);
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
    const bestSoFar = {}; const prs = [];
    Object.values(S.s.workouts).sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => w.entries.filter(S.entryLogged).forEach((e) => {
      const top = S.doneSets(e).reduce((b, st) => (S.e1rm(+st.w, +st.r) > (b ? S.e1rm(+b.w, +b.r) : -1) ? st : b), null); if (!top) return;
      const v = S.e1rm(+top.w, +top.r);
      if (bestSoFar[e.exId] !== undefined && v > bestSoFar[e.exId] && w.date >= from) prs.push({ date: w.date, id: e.exId, w: +top.w, r: +top.r });
      bestSoFar[e.exId] = Math.max(bestSoFar[e.exId] ?? -1, v);
    }));
    const monthPRs = prs.filter((p) => p.date.slice(0, 7) === t.slice(0, 7)).length;

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
      h('section.card.glass', [h('div.card-head', [h('h3', 'Best week'), h('small.muted', 'all time')]),
        bestVol ? h('div.bestweek', [
          h('div', [h('small.eyebrow', 'Volume'), GT.ui.num(Math.round(bestVol.vol), ' ' + unit, 0, 'strong.mono'), h('small.muted', `week of ${fmtDate(bestVol.k)}`)]),
          h('div', [h('small.eyebrow', 'Completion'), GT.ui.num(Math.round(bestComp.avg), '%', 0, 'strong.mono'), h('small.muted', `week of ${fmtDate(bestComp.k)}`)])
        ]) : h('p.muted.small', 'No weeks logged yet.'),
        bestVol ? h('div.goal-bar', [h('div', h('b', { style: { width: Math.min(100, pctOfBest) + '%' } })), h('small.muted.mono', `This week ${pctOfBest}% of best`)]) : null]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Top lifts'), h('small.muted', 'est. 1RM')]),
        series.length ? GT.ui.multiLine(series, { empty: 'Needs 3+ sessions of an exercise' }) : h('p.muted.small', 'Needs 3+ sessions of an exercise in this range.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Personal records'), h('small.muted', `${monthPRs} this month`)]),
        prs.length ? h('div.daylist', prs.slice(-12).reverse().map((p) => h('button.dayrow', { onclick: () => detail(p.id) }, [h('span.mono.muted.prdate', fmtDate(p.date)), h('div.grow', h('strong', S.ex(p.id).name)), h('span.mono.small', `${fmtW(p.w)}×${p.r}`)]))) : h('p.muted.small', 'No new records in this range yet.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Most skipped'), h('small.muted', 'of times planned')]),
        skipRows.length ? barList(skipRows.map((x) => ({ label: S.ex(x.id).name, value: x.n / x.of, display: `${x.n}/${x.of}` }))) : h('p.muted.small', 'Nothing skipped — every planned exercise got done.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Most swapped'), h('small.muted', 'times')]),
        swapRows.length ? h('div.daylist', swapRows.map(([k, n]) => { const [a, b] = k.split('>'); return h('div.dayrow', [h('div.grow', [h('strong', S.ex(a).name), h('small.muted.block', `→ ${S.ex(b).name}`)]), h('span.mono', `${n}×`)]); })) : h('p.muted.small', 'No swaps in this range.')]),
      h('section.card.glass', [h('div.card-head', [h('h3', 'Rep ranges'), h('small.muted', `${totalSets} sets`)]),
        barList(buckets.map((b) => ({ label: b.l + ' reps', value: b.n, display: totalSets ? Math.round((b.n / totalSets) * 100) + '%' : '—' })))])
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
    let metric = 'top';
    const wrap = h('div');
    const draw = () => {
      wrap.innerHTML = '';
      const val = (x) => metric === 'e1rm' ? Math.max(...x.sets.map((st) => S.e1rm(st.w, st.r))) : metric === 'top' ? Math.max(...x.sets.map((st) => st.w)) : x.sets.reduce((a, st) => a + st.w * st.r, 0);
      GT.ui.append(wrap, [
        h('div.grid3', [mini(String(pr.sessions), 'sessions'), mini(ago === 0 ? 'Today' : ago === 1 ? '1 day' : `${ago} days`, 'since last'), mini(fmtW(pr.best1rm.v), 'best e1RM')]),
        h('div.seg.mini', [['top', 'Top set'], ['e1rm', 'Est. 1RM'], ['vol', 'Volume']].map(([k, l]) => h('button' + (metric === k ? '.on' : ''), { onclick: () => { metric = k; draw(); } }, l))),
        lineChart(hist.map((x) => ({ x: fmtDate(x.date), y: val(x), tip: `${fmtDate(x.date)} · ${fmtW(val(x))} ${S.s.settings.unit}` })), { height: 150, xLabels: true }),
        h('p.section-label', 'Best weight by reps'),
        h('div.repbest', repBest.map(([n, b]) => h('div', [h('small', `${n}+ reps`), h('strong.mono', b ? `${fmtW(b.w)}` : '—'), h('small.muted', b ? fmtDate(b.date) : '')]))),
        h('p.section-label', 'History'),
        h('div.daylist', hist.slice().reverse().slice(0, 30).map((x) => h('div.dayrow', [h('span.muted', fmtDate(x.date, { day: 'numeric', month: 'short', year: '2-digit' })), h('span.mono.small.sets', x.sets.map((st) => `${st.r}×${fmtW(st.w)}`).join('  '))])))
      ]);
    };
    draw();
    sheet(ex.name, wrap, { full: true });
  }
  const mini = (v, l) => h('div.mini-stat', [h('strong.mono', v), h('small', l)]);

  // ---------- body ----------
  function body(root) {
    const B = S.s.body; const t = S.todayKey(); if (!bodyDate) bodyDate = t;
    const logs = B.logs; const dates = Object.keys(logs).sort();
    const unitFor = (p) => (p === 'Weight' ? S.s.settings.unit : S.s.settings.dist);
    const lastBefore = (p, d) => { for (let i = dates.length - 1; i >= 0; i--) if (dates[i] < d && logs[dates[i]][p] !== undefined) return { d: dates[i], v: logs[dates[i]][p] }; return null; };
    const first = (p) => { for (const d of dates) if (logs[d][p] !== undefined) return logs[d][p]; return null; };

    const rows = B.parts.map((p) => {
      const cur = logs[bodyDate]?.[p]; const prev = lastBefore(p, bodyDate); const goal = B.goals[p];
      const input = h('input.num.mono', { type: 'number', inputmode: 'decimal', step: 'any', value: cur ?? '', placeholder: prev ? String(prev.v) : '—', 'aria-label': p });
      input.addEventListener('change', () => {
        if (input.value === '') { if (logs[bodyDate]) { delete logs[bodyDate][p]; if (!Object.keys(logs[bodyDate]).length) delete logs[bodyDate]; } }
        else { logs[bodyDate] = logs[bodyDate] || {}; logs[bodyDate][p] = Number(input.value); }
        S.save(); GT.ui.haptic(8); GT.app.rerender();
      });
      const delta = cur !== undefined && prev ? +(cur - prev.v).toFixed(2) : null;
      let goalPct = null;
      if (goal) { const start = first(p); const now = cur ?? prev?.v; if (start !== null && now !== undefined && start !== goal) goalPct = Math.max(0, Math.min(100, ((now - start) / (goal - start)) * 100)); }
      return h('div.body-row', [
        h('button.body-name', { onclick: () => { bodyPart = p; GT.app.rerender(); } }, [h('strong', p), h('small.muted', prev ? `${S.parseKey(prev.d).getDay() === 6 ? 'Sat' : fmtDate(prev.d)} · ${prev.v}` : 'no entries')]),
        delta !== null ? h('span.mono.small.' + (delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'), (delta > 0 ? '+' : '') + delta) : h('span'),
        h('div.body-input', [input, h('small.muted', unitFor(p))]),
        h('button.goal-btn' + (goal ? '.on' : ''), { onclick: () => goalSheet(p), 'aria-label': `Goal for ${p}` }, icon('target', 18)),
        // goal progress as a single bar (idea 5)
        goal ? h('div.goal-bar', [h('div', h('b', { style: { width: (goalPct ?? 0) + '%' } })), h('small.muted.mono', `${Math.round(goalPct ?? 0)}% · goal ${goal}${(cur ?? prev?.v) !== undefined ? ' · ' + Math.abs(+(goal - (cur ?? prev?.v)).toFixed(1)) + ' to go' : ''}`)]) : null
      ]);
    });

    // chart for the selected part
    const ptDates = dates.filter((d) => logs[d][bodyPart] !== undefined);
    const pts = ptDates.map((d) => ({ x: fmtDate(d), y: logs[d][bodyPart], tip: `${fmtDate(d)} · ${logs[d][bodyPart]} ${unitFor(bodyPart)}` }));
    // left/right pairs, e.g. "Left Forearm" + "Right Forearm"
    const pairs = [];
    B.parts.forEach((p) => { const m = p.match(/^(left|right|l|r)\s+(.+)$/i); if (m && /^(left|l)$/i.test(m[1])) { const other = B.parts.find((q) => new RegExp(`^(right|r)\\s+${m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(q)); if (other) pairs.push([p, other, m[2]]); } });

    root.append(
      h('div.datenav', [
        h('button.icon-btn', { onclick: () => { bodyDate = S.addDays(bodyDate, -1); GT.app.rerender(); }, 'aria-label': 'Previous day' }, icon('left')),
        h('button.datenav-mid', { onclick: () => { bodyDate = t; GT.app.rerender(); } }, [h('strong', fmtDate(bodyDate, { weekday: 'short', day: 'numeric', month: 'short' })), bodyDate !== t ? h('small.accent', 'Back to today') : S.parseKey(t).getDay() === 6 ? h('small.accent', 'Check-in day') : null]),
        h('button.icon-btn', { onclick: () => { bodyDate = S.addDays(bodyDate, 1); GT.app.rerender(); }, 'aria-label': 'Next day' }, icon('right'))
      ]),
      h('section.card.glass', [h('h3', 'Measurements'), ...rows,
        h('button.btn.ghost.wide', { onclick: async () => { const n = await prompt('New body part', '', 'e.g. Right Forearm'); if (!n) return; if (B.parts.some((p) => p.toLowerCase() === n.toLowerCase())) { toast('Already tracked', 'error'); return; } B.parts.push(n); S.save(); GT.app.rerender(); } }, [icon('plus', 18), 'Add body part'])]),
      h('section.card.glass', [
        h('div.card-head', [h('h3', bodyPart), B.goals[bodyPart] ? h('small.muted', `Goal ${B.goals[bodyPart]}`) : null]),
        h('div.chips.scroll', B.parts.map((p) => h('button.chip' + (p === bodyPart ? '.on' : ''), { onclick: () => { bodyPart = p; GT.app.rerender(); } }, p))),
        // dashed line = 7-day average (entries in the 7 days up to each point)
        lineChart(pts, { height: 140, xLabels: true, unit: ' ' + unitFor(bodyPart), empty: `Log ${bodyPart} on two days to see a trend`,
          overlay: bodyPart === 'Weight' ? pts.map((_, i) => { const d0 = ptDates[i]; const win = ptDates.filter((d) => d <= d0 && d > S.addDays(d0, -7)).map((d) => logs[d].Weight); return win.length > 1 ? +(win.reduce((x, y) => x + y, 0) / win.length).toFixed(2) : null; }) : null }),
        bodyPart === 'Weight' && pts.length > 1 ? h('small.muted', '- - -  7-day average') : null
      ]),
      pairs.length ? h('section.card.glass', [h('h3', 'Left vs right'), ...pairs.map(([l, r, name]) => {
        const lv = latest(l), rv = latest(r); const max = Math.max(lv || 0, rv || 0, 1); const diff = lv && rv ? +(rv - lv).toFixed(2) : null;
        return h('div.lr', [h('div.row.between', [h('strong', name), h('small.mono.muted', diff === null ? 'need both sides' : diff === 0 ? 'even' : `${diff > 0 ? 'right' : 'left'} +${Math.abs(diff)} ${S.s.settings.dist}`)]),
          h('div.lr-bars', [h('div.lr-side.l', [h('div', { style: { width: ((lv || 0) / max) * 100 + '%' } }), h('span.mono', `L ${lv ?? '—'}`)]), h('div.lr-side.r', [h('div', { style: { width: ((rv || 0) / max) * 100 + '%' } }), h('span.mono', `R ${rv ?? '—'}`)])])]);
      })]) : null
    );
    function latest(p) { for (let i = dates.length - 1; i >= 0; i--) if (logs[dates[i]][p] !== undefined) return logs[dates[i]][p]; return null; }
  }

  function goalSheet(part) {
    const B = S.s.body; const input = h('input.field.mono', { type: 'number', inputmode: 'decimal', value: B.goals[part] ?? '', placeholder: 'Target value' });
    const custom = !['Weight', 'Neck', 'Chest', 'Waist', 'Hips'].includes(part);
    const sh = sheet(`${part} goal`, [input, custom ? h('button.btn.ghost.wide.danger', { onclick: async () => { if (!(await confirm(`Stop tracking ${part}? Past entries stay in backups.`, 'Remove', true))) return; B.parts = B.parts.filter((p) => p !== part); delete B.goals[part]; S.save(); sh.close(); GT.app.rerender(); } }, [icon('trash', 16), `Remove ${part}`]) : null],
      { footer: [B.goals[part] !== undefined ? h('button.btn.ghost.grow', { onclick: () => { delete B.goals[part]; S.save(); sh.close(); GT.app.rerender(); } }, 'Clear goal') : null, h('button.btn.primary.grow', { onclick: () => { const v = Number(input.value); if (!(v > 0)) { toast('Enter a positive number', 'error'); return; } B.goals[part] = v; S.save(); sh.close(); GT.app.rerender(); } }, 'Save goal')] });
  }

  GT.progress = { render };
})();
