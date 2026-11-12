/* =====================================================================
 * GymTrack v2 — ui.js
 * Shared building blocks: element builder, icons, bottom sheets, toasts,
 * confirm/prompt, haptics, and hand-drawn SVG charts (no CDN = works offline).
 * ===================================================================== */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});

  // ---------- element builder ----------
  // h('div.card.glass', { onclick }, [children]) — tag.class shorthand,
  // props starting with "on" become listeners, strings become text nodes.
  function h(sel, props, kids) {
    if (Array.isArray(props) || typeof props === 'string' || props instanceof Node) { kids = props; props = {}; }
    const [tag, ...cls] = sel.split('.');
    const el = document.createElement(tag || 'div');
    if (cls.length) el.className = cls.join(' ');
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([sk, sv]) => (sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv))); // CSS variables need setProperty
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className += ' ' + v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    if (kids === undefined || kids === null || kids === false) return;
    (Array.isArray(kids) ? kids : [kids]).forEach((k) => {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) append(el, k);
      else Element.prototype.append.call(el, k instanceof Node ? k : document.createTextNode(String(k)));
    });
  }

  // ---------- icons (inline SVG, stroke-based) ----------
  const P = {
    home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
    snap: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    log: 'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    timer: 'M12 8v5l3 2M9 2h6M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    plan: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    body: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 8h14M12 8v6M9 22l3-8 3 8',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    x: 'M6 6l12 12M18 6 6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    down: 'M5 9l7 7 7-7',
    up: 'M5 15l7-7 7 7',
    swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
    undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    play: 'M7 4v16l13-8z',
    pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
    skip: 'M5 4v16l10-8zM17 4v16',
    reset: 'M4 4v6h6M4.5 15a8 8 0 1 0 1.8-8.3L4 10',
    flame: 'M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z',
    trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
    folder: 'M3 6h6l2 2h10v11H3z',
    focus: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    list: 'M4 6h16M4 12h16M4 18h16',
    note: 'M5 4h10l4 4v12H5zM14 4v5h5',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    upload: 'M12 20V8M7 13l5-5 5 5M4 4h16',
    drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 12h.01',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4'
  };
  function icon(name, size = 20) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<path d="${P[name] || ''}"/>`;
    return s;
  }

  // ---------- colours ----------
  // Accent palette the user can pick from in Settings → Appearance.
  // Accents for Custom mode.
  const ACCENTS = { pearl: '#EDEDED', ice: '#cdeffd', cyan: '#22d3ee', violet: '#a78bfa', lime: '#a3e635', coral: '#fb7185', amber: '#fbbf24', rose: '#f472b6' };
  // Curated pairings (accent → second tone). Pearl & Gold is the default.
  const THEMES = {
    'pearl-gold': { name: 'Pearl & Gold', a: '#EDEDED', b: '#D9B46A' },
    'ice-champagne': { name: 'Ice & Champagne', a: '#CDEFFD', b: '#E9D8B4' },
    'violet-rose': { name: 'Violet & Rose', a: '#8B7CFF', b: '#FF8FB1' },
    'teal-lime': { name: 'Teal & Lime', a: '#2DE2C4', b: '#B6F36A' },
    'sky-lavender': { name: 'Sky & Lavender', a: '#8EC5FF', b: '#C4BCFF' },
    ember: { name: 'Ember', a: '#FF9A62', b: '#FFD36E' }
  };
  // Fixed muscle-group colours — the small accents used on chips, dots and bars.
  const MUSCLE_COLORS = { Chest: '#fb7185', Back: '#22d3ee', Lats: '#38bdf8', Shoulders: '#fbbf24', 'Rear Delts': '#f59e0b', Traps: '#c084fc', Biceps: '#a78bfa', Triceps: '#818cf8', Forearms: '#94a3b8', Legs: '#a3e635', Calves: '#4ade80', Abs: '#f472b6', Cardio: '#2dd4bf', Other: '#64748b', Rest: '#475569' };
  // Muscle groups no longer get their own colours (too busy). Everything that
  // used to be colour-coded now uses one neutral tone; the accent is reserved
  // for active / progress states.
  const muscleColor = () => 'var(--mono)';
  function hashColor(str) { let x = 0; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) | 0; return `hsl(${Math.abs(x) % 360} 70% 65%)`; }
  // Second tone: used only for exercise names and best-set / PR highlights.
  // The 10 second tones available in Custom mode.
  const HIGHLIGHTS = { champagne: '#E9D8B4', gold: '#D9B46A', 'rose gold': '#E8B4A0', peach: '#F5C2A8', coral: '#FF8A80', lavender: '#C4BCFF', lilac: '#D6B4F5', mint: '#9EF0C9', sky: '#8EC5FF', pearl: '#EDEDED' };
  // Applies a curated theme, or the custom accent + second tone.
  function applyTheme(st) {
    const t = THEMES[st.theme];
    const a = t ? t.a : ACCENTS[st.accent] || ACCENTS.pearl;
    const b = t ? t.b : HIGHLIGHTS[st.highlight] || HIGHLIGHTS.gold;
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--hl', b);
  }
  function applyHighlight(name) {
    const c = HIGHLIGHTS[name] === undefined ? HIGHLIGHTS.champagne : HIGHLIGHTS[name];
    document.documentElement.style.setProperty('--hl', c || 'var(--accent)'); // Off = single tone
  }
  function applyAccent(name) {
    const c = ACCENTS[name] || ACCENTS.ice;
    document.documentElement.style.setProperty('--accent', c);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#000000');
  }

  // ---------- feedback ----------
  function haptic(pattern = 12) { try { if (GT.store.s.settings.vibrate && navigator.vibrate) navigator.vibrate(pattern); } catch (_) {} }
  let audioCtx = null;
  function beep(strong = false) {
    if (!GT.store.s.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.frequency.value = strong ? 880 : 660; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (strong ? 0.6 : 0.25));
      o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + (strong ? 0.65 : 0.3));
    } catch (_) {}
  }
  function toast(msg, type = 'ok', action) {
    const host = document.getElementById('toasts');
    const t = h('div.toast.' + type, [h('span', msg), action ? h('button.toast-act', { onclick: () => { action.fn(); t.remove(); } }, action.label) : null]);
    host.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, action ? 4500 : 2400);
  }

  // ---------- bottom sheets ----------
  // A stack so a sheet can open another (e.g. Plan editor → exercise picker).
  const sheets = [];
  function sheet(title, body, opts = {}) {
    const scrim = h('div.scrim');
    const panel = h('div.sheet' + (opts.full ? '.full' : ''), { role: 'dialog', 'aria-label': title }, [
      h('div.sheet-grab'),
      h('div.sheet-head', [h('h3', title), h('button.icon-btn', { onclick: () => close(), 'aria-label': 'Close' }, icon('x'))]),
      h('div.sheet-body', body),
      opts.footer ? h('div.sheet-foot', opts.footer) : null
    ]);
    const wrap = h('div.sheet-wrap', [scrim, panel]);
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    scrim.addEventListener('click', () => close());
    // swipe the grab handle down to dismiss
    let y0 = null;
    panel.querySelector('.sheet-grab').addEventListener('pointerdown', (e) => { y0 = e.clientY; panel.setPointerCapture(e.pointerId); });
    panel.addEventListener('pointermove', (e) => { if (y0 !== null) panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    panel.addEventListener('pointerup', (e) => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; panel.style.transform = ''; if (dy > 90) close(); });
    function close(val) {
      const i = sheets.indexOf(api); if (i < 0) return; sheets.splice(i, 1);
      wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 280);
      opts.onClose && opts.onClose(val);
    }
    const api = { close, panel, body: panel.querySelector('.sheet-body') };
    sheets.push(api);
    return api;
  }
  const closeTopSheet = () => { const s = sheets[sheets.length - 1]; if (s) { s.close(); return true; } return false; };

  function confirm(message, okLabel = 'Confirm', danger = false) {
    return new Promise((res) => {
      let answered = false;
      const sh = sheet('Are you sure?', h('p.muted', message), {
        footer: [h('button.btn.ghost', { onclick: () => { answered = true; sh.close(); res(false); } }, 'Cancel'), h('button.btn' + (danger ? '.danger' : '.primary'), { onclick: () => { answered = true; sh.close(); res(true); } }, okLabel)],
        onClose: () => { if (!answered) res(false); }
      });
    });
  }
  function prompt(title, value = '', placeholder = '') {
    return new Promise((res) => {
      let answered = false;
      const input = h('input.field', { value, placeholder });
      const done = () => { answered = true; sh.close(); res(input.value.trim()); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      const sh = sheet(title, input, { footer: [h('button.btn.ghost', { onclick: () => { answered = true; sh.close(); res(null); } }, 'Cancel'), h('button.btn.primary', { onclick: done }, 'Save')], onClose: () => { if (!answered) res(null); } });
      setTimeout(() => input.focus(), 250);
    });
  }

  // ---------- formatting ----------
  const fmtNum = (n) => (Math.round(n) || 0).toLocaleString('en-IN');
  const fmtW = (w) => (Number.isInteger(+w) ? String(+w) : (+w).toFixed(1).replace(/\.0$/, ''));
  const fmtDate = (k, o = { day: 'numeric', month: 'short' }) => GT.store.parseKey(k).toLocaleDateString('en-IN', o);
  const fmtClock = (ms, hours = false) => {
    const t = Math.max(0, Math.round(ms / 1000)); const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
    return (hours || hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm).padStart(2, '0')) + ':' + String(ss).padStart(2, '0');
  };
  const fmtDur = (sec) => { if (!sec) return '—'; const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

  // Animated count-up for big numbers.
  function countUp(el, to, suffix = '', ms = 700) {
    const start = performance.now();
    const step = (t) => { const p = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - p, 3); el.textContent = fmtNum(to * e) + suffix; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // A number that rolls up from 0 when it first appears: num(42, '%').
  function num(value, suffix = '', decimals = 0, tag = 'strong.mono') {
    const el = h(tag, '0' + suffix);
    const n = Number(value);
    if (!Number.isFinite(n)) { el.textContent = String(value); return el; }
    const start = performance.now(), ms = 650;
    const step = (t) => { const p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = (decimals ? (n * e).toFixed(decimals) : Math.round(n * e).toLocaleString('en-IN')) + suffix; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    return el;
  }

  // ---------- drag to reorder ----------
  // Makes the children of `list` sortable by dragging their `.drag-handle`.
  // The dragged item follows the finger; neighbours swap as you pass their
  // midpoint. onDrop(fromIndex, toIndex) is called once at the end.
  function dragSort(list, onDrop) {
    list.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.drag-handle'); if (!handle || !list.contains(handle)) return;
      const item = [...list.children].find((c) => c.contains(handle)); if (!item) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      const from = [...list.children].indexOf(item);
      let y0 = e.clientY; item.classList.add('dragging'); haptic(15);
      const move = (ev) => {
        let dy = ev.clientY - y0;
        const prev = item.previousElementSibling, next = item.nextElementSibling;
        // swap with a neighbour once we cross half its height
        if (next && dy > next.offsetHeight / 2) { list.insertBefore(next, item); y0 += next.offsetHeight + 8; dy = ev.clientY - y0; haptic(5); }
        else if (prev && dy < -prev.offsetHeight / 2) { list.insertBefore(item, prev); y0 -= prev.offsetHeight + 8; dy = ev.clientY - y0; haptic(5); }
        item.style.transform = `translateY(${dy}px) scale(1.02)`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        item.classList.remove('dragging'); item.style.transform = '';
        const to = [...list.children].indexOf(item);
        if (to !== from) onDrop(from, to);
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }

  // ---------- SVG charts ----------
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };

  // Progress ring. pct = 0..100 (or null for "—").
  function ring(pct, size = 120, stroke = 10, color = 'var(--accent)', label, inset = 0) {
    const r = (size - stroke) / 2 - inset, c = 2 * Math.PI * r;
    const s = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ring' });
    s.append(svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': stroke }));
    // default arc is a gradient: accent → second tone (stops styled in CSS so
    // "warm" states can recolour them)
    let stroke2 = color;
    if (color === 'var(--accent)') {
      const id = 'rg' + Math.random().toString(36).slice(2, 8);
      const defs = svgEl('defs'); const lg = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 1 });
      lg.append(svgEl('stop', { offset: '0%', class: 'g1' }), svgEl('stop', { offset: '100%', class: 'g2' }));
      defs.append(lg); s.append(defs); stroke2 = `url(#${id})`;
    }
    const arc = svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: stroke2, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c, transform: `rotate(-90 ${size / 2} ${size / 2})`, class: 'ring-arc' });
    s.append(arc);
    // animate the fill in on arrival (skipped at 0 so callers that drive the arc themselves aren't overwritten)
    if (pct) requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', c * (1 - pct / 100))));
    const wrap = h('div.ring-wrap', { style: { width: size + 'px', height: size + 'px' } }, [s, label || null]);
    return wrap;
  }

  // Line/area chart. points: [{ x: label, y: number|null, tip }]. Tap shows a tooltip.
  function lineChart(points, opts = {}) {
    const W = 340, H = opts.height || 150, pad = { l: 6, r: 6, t: 14, b: opts.xLabels ? 20 : 8 };
    const wrap = h('div.chart' + (opts.cls ? '.' + opts.cls : ''));
    const valid = points.filter((p) => p.y !== null && p.y !== undefined);
    if (valid.length < 2) { wrap.append(h('p.chart-empty', opts.empty || 'Not enough data yet')); return wrap; }
    const ys = valid.map((p) => p.y).concat((opts.overlay || []).filter((v) => v !== null && v !== undefined));
    const min = opts.min !== undefined ? opts.min : Math.min(...ys), max = opts.max !== undefined ? opts.max : Math.max(...ys);
    const span = max - min || 1;
    const X = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
    const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'chart-svg' });
    const color = opts.color || 'var(--accent)';
    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    const defs = svgEl('defs'); const lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.35 }), svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
    defs.append(lg); s.append(defs);
    // grid lines
    [0.25, 0.5, 0.75].forEach((f) => s.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + f * (H - pad.t - pad.b), y2: pad.t + f * (H - pad.t - pad.b), class: 'grid' })));
    // build path segments, skipping nulls (rest days)
    let d = '', area = '', first = null, last = null;
    points.forEach((p, i) => {
      if (p.y === null || p.y === undefined) return;
      const x = X(i), y = Y(p.y);
      d += (first === null ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      if (first === null) first = x; last = x;
    });
    area = d + `L${last} ${H - pad.b} L${first} ${H - pad.b} Z`;
    s.append(svgEl('path', { d: area, fill: `url(#${gid})` }));
    let lineStroke = color;
    if (!opts.color) { const lid = 'l' + gid; const lg2 = svgEl('linearGradient', { id: lid, x1: 0, y1: 0, x2: 1, y2: 0 }); lg2.append(svgEl('stop', { offset: '0%', class: 'g1' }), svgEl('stop', { offset: '100%', class: 'g2' })); defs.append(lg2); lineStroke = `url(#${lid})`; }
    const line = svgEl('path', { d, fill: 'none', stroke: lineStroke, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'chart-line' });
    s.append(line);
    points.forEach((p, i) => { if (p.y === null || p.y === undefined) return; s.append(svgEl('circle', { cx: X(i), cy: Y(p.y), r: points.length > 40 ? 1.6 : 3, fill: color, class: 'dot' })); });
    // optional second series drawn as a dashed line (e.g. a 7-day average)
    if (opts.overlay) {
      let od = ''; opts.overlay.forEach((v, i) => { if (v === null || v === undefined) return; od += (od ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; });
      if (od) s.append(svgEl('path', { d: od, fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1.4, 'stroke-dasharray': '4 4' }));
    }
    if (opts.xLabels) {
      const step = Math.ceil(points.length / 5);
      points.forEach((p, i) => { if (i % step === 0 || i === points.length - 1) { const t = svgEl('text', { x: X(i), y: H - 5, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle' }); t.textContent = p.x; s.append(t); } });
    }
    wrap.append(s);
    // tap / drag → nearest point tooltip
    const tip = h('div.chart-tip'); wrap.append(tip);
    const cursor = svgEl('line', { y1: pad.t, y2: H - pad.b, class: 'cursor' }); s.append(cursor);
    const show = (ev) => {
      const r = s.getBoundingClientRect(); const fx = ((ev.clientX - r.left) / r.width) * W;
      let best = null, bd = 1e9; points.forEach((p, i) => { if (p.y === null || p.y === undefined) return; const dd = Math.abs(X(i) - fx); if (dd < bd) { bd = dd; best = i; } });
      if (best === null) return;
      const p = points[best]; cursor.setAttribute('x1', X(best)); cursor.setAttribute('x2', X(best)); cursor.style.opacity = 1;
      tip.textContent = p.tip || `${p.x}: ${fmtNum(p.y)}${opts.unit || ''}`; tip.style.opacity = 1;
      tip.style.left = Math.min(Math.max((X(best) / W) * 100, 15), 85) + '%';
    };
    s.addEventListener('pointerdown', show); s.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') show(e); });
    s.addEventListener('pointerleave', () => { tip.style.opacity = 0; cursor.style.opacity = 0; });
    return wrap;
  }

  // Several lines on one chart (e.g. top 3 lifts). series: [{ name, color, pts: [{ k: dateKey, y }] }]
  function multiLine(series, opts = {}) {
    const W = 340, H = opts.height || 160, pad = { l: 6, r: 6, t: 12, b: 20 };
    const keys = [...new Set(series.flatMap((s) => s.pts.map((p) => p.k)))].sort();
    const wrap = h('div.chart');
    if (keys.length < 2) { wrap.append(h('p.chart-empty', opts.empty || 'Not enough data yet')); return wrap; }
    const ys = series.flatMap((s) => s.pts.map((p) => p.y)); const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const X = (k) => pad.l + (keys.indexOf(k) / (keys.length - 1)) * (W - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
    const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'chart-svg' });
    [0.25, 0.5, 0.75].forEach((f) => s.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + f * (H - pad.t - pad.b), y2: pad.t + f * (H - pad.t - pad.b), class: 'grid' })));
    series.forEach((ser) => {
      const d = ser.pts.slice().sort((a, b) => a.k.localeCompare(b.k)).map((p, i) => `${i ? 'L' : 'M'}${X(p.k).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
      s.append(svgEl('path', { d, fill: 'none', stroke: ser.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'chart-line' }));
      ser.pts.forEach((p) => s.append(svgEl('circle', { cx: X(p.k), cy: Y(p.y), r: 2.4, fill: ser.color })));
    });
    [0, keys.length - 1].forEach((i) => { const t = svgEl('text', { x: X(keys[i]), y: H - 5, class: 'axis', 'text-anchor': i ? 'end' : 'start' }); t.textContent = fmtDate(keys[i]); s.append(t); });
    wrap.append(s, h('div.legend-line', series.map((ser) => h('span', [h('i', { style: { background: ser.color } }), ser.name]))));
    return wrap;
  }

  // Horizontal bar list, e.g. sets per muscle group.
  function barList(rows, opts = {}) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return h('div.bars', rows.map((r) => h('div.bar-row', [
      h('span.bar-label', [h('i.dot', { style: { background: r.color || 'var(--accent)' } }), r.label]),
      h('div.bar-track', h('div.bar-fill', { style: { width: (r.value / max) * 100 + '%', background: r.color || 'var(--accent)' } })),
      h('span.bar-val', r.display || fmtNum(r.value) + (opts.unit || ''))
    ])));
  }

  // Tiny sparkline for inline use.
  function sparkline(values, color = 'var(--accent)') {
    const W = 80, H = 24; const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'spark' });
    if (values.length < 2) return s;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * W} ${H - 2 - ((v - min) / span) * (H - 4)}`).join(' ');
    s.append(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
    return s;
  }

  GT.ui = { h, append, num, dragSort, multiLine, icon, ACCENTS, HIGHLIGHTS, THEMES, applyTheme, applyHighlight, MUSCLE_COLORS, muscleColor, applyAccent, haptic, beep, toast, sheet, closeTopSheet, confirm, prompt, fmtNum, fmtW, fmtDate, fmtClock, fmtDur, countUp, ring, lineChart, barList, sparkline };
})();
