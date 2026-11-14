/* Body — its own screen (opened from More): weight and measurements for a
 * day, goal bars, a trend chart for one part (+7-day average for weight) and
 * left-vs-right comparisons. Moved out of Progress unchanged. */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, fmtDate, lineChart, sheet, toast, confirm, prompt } = GT.ui;
  const S = GT.store;

  let bodyDate = null; let bodyPart = 'Weight';

  function render(root) {
    root.append(h('header.top', [h('div.grow', [h('p.eyebrow', 'Weight & measurements'), h('h1', 'Body')])]));
    body(root);
  }

  // measurements with goal bars, trend chart (+7-day avg for weight), left-vs-right
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

  GT.body = { render };
})();
