/* Today — the dashboard: today's ring + muscles, streaks, 30-day completion,
 * a one-tap "Start session", and doorways into Progress, Plan and Settings. */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, ring, lineChart, muscleColor, countUp, fmtDate, num } = GT.ui;
  const S = GT.store;

  function render(root) {
    const t = S.todayKey();
    const { done, total } = S.plannedDoneCount(t);
    const pct = total ? Math.round((done / total) * 100) : null;
    const muscles = S.musclesFor(t);
    const streak = S.currentStreak(); const longest = S.longestStreak();
    // 30-day completion series (rest/omitted days are gaps, missed days = 0)
    const series = []; let sum = 0, n = 0;
    for (let i = 29; i >= 0; i--) { const d = S.addDays(t, -i); const c = S.completion(d); series.push({ x: fmtDate(d), y: c, tip: `${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} · ${c === null ? 'rest' : c + '%'}` }); if (c !== null) { sum += c; n++; } }
    const avg = n ? Math.round(sum / n) : 0;

    const status = total === 0 ? 'Rest day' : done >= total ? 'Day complete' : done > 0 ? 'In progress' : 'Not started';
    const statusCls = total === 0 ? 'rest' : done >= total ? 'ok' : done > 0 ? 'live' : 'idle';

    // 7-day strip: one pill per day of this week, coloured by status
    const monday = S.addDays(t, -((S.parseKey(t).getDay() + 6) % 7));
    // Each day fills from the bottom by its completion %: empty = 0%, full = 100%.
    const week = S.DAYS.map((d, i) => {
      const k = S.addDays(monday, i); const st = S.dayStatus(k); const c = S.completion(k);
      const pc = c === null ? (st === 'logged' ? 100 : 0) : c;
      // the fill's colour also strengthens with the % (--c), so 40% reads softer than 90%
      return h('div.wk-day.' + st + (k === t ? '.is-today' : ''), { onclick: () => GT.activity.openDate(k) },
        [h('small', d.slice(0, 1)), h('i', h('b', { style: { height: pc + '%', '--c': pc / 100 } })), h('small.mono.wk-pct', c === null ? (st === 'rest' ? 'rest' : '') : c + '%')]);
    });

    const sat = S.parseKey(t).getDay() === 6 && !S.s.body.logs[t];

    const streakNum = h('strong.mono');
    root.append(
      h('div.today-timer-space', { 'aria-hidden': 'true' }),
      h('header.top', [
        h('h1.date-title', fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })),
        h('button.icon-btn.glass.today-settings', { onclick: () => GT.app.go('settings'), 'aria-label': 'Settings' }, icon('gear', 28))
      ]),

      // hero: today's ring
      h('section.card.glass.hero', [
        // at 100% the ring gives one gentle glow
        h('div.hero-ring' + (total && done >= total ? '.complete' : ''), ring(pct ?? 0, 104, 9, 'var(--accent)', h('div.ring-label', [pct === null ? h('strong.mono', '—') : num(pct, '%'), h('small', total ? `${done}/${total}` : 'rest')]))),
        h('div.hero-info', [
          h('span.pill.' + statusCls, status),
          h('h2', S.dayLabel(t)),
          h('div.chips.tight', muscles.filter((m) => m !== 'Rest').map((m) => h('span.mchip', { style: { '--m': muscleColor(m) } }, m))),
        ])
      ]),

      // this week's sessions
      h('section.card.glass.today-week', [h('h3', 'This week'), h('div.week', week)]),

      // 30-day completion trend
      h('section.card.glass.today-completion', [
        h('div.row.between', [h('h3', 'Completion · 30 days'), num(avg, '%', 0, 'strong.mono.accent')]),
        lineChart(series, { min: 0, max: 100, unit: '%', height: 144, xLabels: true, empty: 'Log a few workouts to see your trend' })
      ]),

      // streaks stay below the chart
      h('section.grid2.today-streaks', [
        h('div.card.glass.stat', [h('div.stat-ico.flame', icon('flame', 22)), streakNum,
          // milestone badge on the day the streak hits 7 / 14 / 21 / 30 / 50 / 75 / 100 / every 50 after
          [7, 14, 21, 30, 50, 75, 100].includes(streak) || (streak > 100 && streak % 50 === 0) ? h('span.milestone', `${streak}-day milestone`) : null,
          h('small', 'day streak')]),
        h('div.card.glass.stat', [h('div.stat-ico', icon('trophy', 22)), num(longest), h('small', 'longest streak')])
      ]),

      sat ? h('button.card.glass.nudge', { onclick: () => GT.app.go('progress', { tab: 'body' }) }, [icon('body'), h('div', [h('strong', 'Saturday check-in'), h('small', 'Log your weight and measurements')]), icon('right')]) : null,
    );
    countUp(streakNum, streak, '', 600);
  }

  GT.today = { render };
})();
