/* =====================================================================
 * GymTrack v2 — app.js
 * Shell: boots the store, draws the bottom bar, routes between screens,
 * handles the Android back button / swipe-back, and registers offline mode.
 * Bottom bar: Today · Snapshot · Activity · [Log] · Timer · Plan · More
 * More opens a sheet with three screens: Progress, Body and Settings.
 * ===================================================================== */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon } = GT.ui;
  const S = GT.store;

  const TABS = [
    { id: 'today', label: 'Today', icon: 'home' },
    { id: 'snapshot', label: 'Snapshot', icon: 'snap' },
    { id: 'activity', label: 'Activity', icon: 'cal' },
    { id: 'log', label: 'Log', icon: 'log', center: true },
    { id: 'timer', label: 'Timer', icon: 'timer' },
    { id: 'plan', label: 'Plan', icon: 'plan' },
    { id: 'more', label: 'More', icon: 'more' }   // not a screen: opens the hub sheet
  ];
  // The three screens that live behind "More". They all light up the More tab.
  const MORE = [
    { id: 'progress', label: 'Progress', icon: 'chart' },
    { id: 'body', label: 'Body', icon: 'body' },
    { id: 'settings', label: 'Settings', icon: 'gear' }
  ];
  const isMoreKid = (id) => MORE.some((m) => m.id === id);
  // Which bottom-bar button a screen belongs to (Progress/Body/Settings → More).
  const navId = (id) => (isMoreKid(id) ? 'more' : id);
  const tabIndex = (id) => TABS.findIndex((t) => t.id === navId(id));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const app = (GT.app = {
    current: 'today',
    from: 'today',       // the tab you were on before opening a More screen (back goes here)
    lastMore: null,      // last More screen used (tapping More twice jumps to it)
    logDate: null,       // Log and Snapshot keep separate dates (v1 shared one)
    snapDate: null,
    params: {},
    go, rerender, back, openMore
  });

  function screenFor(id) {
    return { today: GT.today, snapshot: GT.snapshot, log: GT.log, activity: GT.activity, timer: GT.timer, plan: GT.plan, progress: GT.progress, body: GT.body, settings: GT.settings }[id];
  }

  // Navigate to a screen. dir: 1 = forward, -1 = back, 0 = work it out from tab order.
  // opts.hub: the jump came from a More tile (that tile morphs into the new screen).
  // opts.before(vt): runs right before the new screen is drawn (used to drop the sheet).
  function go(id, params = {}, dir = 0, opts = {}) {
    const prev = app.current;
    if (isMoreKid(id) && !isMoreKid(prev)) app.from = prev; // remember where to go back to
    if (isMoreKid(id)) app.lastMore = id;
    app.current = id; app.params = params;
    draw(dir || (tabIndex(id) >= tabIndex(prev) ? 1 : -1), opts);
  }
  function back() { if (isMoreKid(app.current)) go(app.from && !isMoreKid(app.from) ? app.from : 'today', {}, -1); }
  function rerender() { draw(0); }

  // Builds the current screen and swaps it in. When the browser supports the
  // View Transitions API (Chrome on Android does), the swap is animated by the
  // browser: old page slides out, new page slides in, the nav stays put, and a
  // tapped More tile expands into the new screen's header.
  function draw(dir, opts = {}) {
    const view = document.getElementById('view');
    const useVT = !!(dir && document.startViewTransition && !reduceMotion());
    const swap = () => {
      opts.before && opts.before(useVT);
      const keepScroll = dir === 0 ? view.scrollTop : 0;
      // CSS slide classes are only the fallback when View Transitions aren't available
      const next = h('div.screen' + (dir && !useVT ? (dir > 0 ? '.enter-r' : '.enter-l') : ''), { 'data-screen': app.current });
      // Screens call root.append(a, cond ? b : null, …); skip the nulls instead
      // of letting the DOM print the word "null".
      next.append = (...kids) => GT.ui.append(next, kids);
      try { screenFor(app.current).render(next, app.params); }
      catch (e) { console.error(e); next.append(h('div.card.glass', [h('h3', 'Something went wrong'), h('p.muted.small', String(e && e.message))])); }
      view.innerHTML = ''; view.append(next); view.scrollTop = keepScroll;
      // the new screen's header is the morph target — named only now, after the
      // old snapshot was taken, so the name is never on two elements at once
      if (useVT && opts.hub) document.documentElement.classList.add('vt-hub');
      drawNav();
      updateGlow();
      GT.timer.tick(true); // refresh live bar visibility for this tab
    };
    if (!useVT) { swap(); return; }
    const root = document.documentElement;
    root.dataset.vt = dir > 0 ? 'fwd' : 'back';
    const vt = document.startViewTransition(swap);
    vt.finished.finally(() => { root.classList.remove('vt-hub'); delete root.dataset.vt; });
  }

  // The background glow brightens a little as today's planned work gets done.
  function updateGlow() {
    const amb = document.querySelector('.ambient'); if (!amb) return;
    const { done, total } = S.plannedDoneCount(S.todayKey());
    amb.style.setProperty('--glow', total ? Math.min(1, done / total).toFixed(2) : 0);
  }

  // ---------- More hub ----------
  let hub = null;
  // One live line under each tile so the hub shows something useful at a glance.
  function hint(id) {
    const t = S.todayKey();
    const daysAgo = (k) => Math.round((S.parseKey(t) - S.parseKey(k)) / 864e5);
    const ago = (n) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
    if (id === 'progress') {
      const monday = S.addDays(t, -((S.parseKey(t).getDay() + 6) % 7));
      let n = 0; for (let k = monday; k <= t; k = S.addDays(k, 1)) if (S.dayStatus(k) === 'logged') n++;
      const st = S.currentStreak();
      return `${st ? st + '-day streak' : 'No active streak'} · ${n} session${n === 1 ? '' : 's'} this week`;
    }
    if (id === 'body') {
      const logs = S.s.body.logs; const last = Object.keys(logs).sort().reverse().find((k) => logs[k].Weight !== undefined);
      if (S.parseKey(t).getDay() === 6 && !logs[t]) return 'Check-in due today';
      return last ? `Weight ${logs[last].Weight} ${S.s.settings.unit} · ${ago(daysAgo(last))}` : 'No check-ins yet';
    }
    const st = S.s.settings;
    const theme = st.theme === 'custom' ? 'Custom theme' : (GT.ui.THEMES[st.theme] || GT.ui.THEMES['pearl-gold']).name;
    return `${theme} · ${st.lastBackup ? 'backup ' + ago(daysAgo(S.dateKey(new Date(st.lastBackup)))) : 'no backup yet'}`;
  }
  function openMore() {
    // More tapped again while the hub is open → straight to the last screen used
    if (hub) { if (app.lastMore) pick(app.lastMore, null); return; }
    const tiles = MORE.map((m, i) => h('button.hub-tile' + (app.current === m.id ? '.on' : ''), {
      style: { '--i': i }, onclick: (e) => pick(m.id, e.currentTarget)
    }, [h('span.hub-ico', icon(m.icon, 22)), h('div.grow', [h('strong', m.label), h('small', hint(m.id))]), icon('right', 18)]));
    hub = GT.ui.sheet('More', h('div.hub', tiles), { cls: 'hub-sheet', onClose: () => { hub = null; } });
  }
  function pick(id, tile) {
    const sh = hub;
    if (app.current === id) { sh && sh.close(); return; }
    if (tile) tile.style.viewTransitionName = 'hub-pick';
    // Settings always opens on its main list when entered from the hub
    go(id, id === 'settings' ? { open: 'root' } : {}, 1, {
      hub: !!tile,
      before: (vt) => { if (sh) sh.close(undefined, vt); } // instant removal inside a view transition
    });
  }

  // The small dot under the active tab is ONE element that glides between tabs.
  let navDot = null;
  function drawNav() {
    const nav = document.getElementById('nav');
    // keep the dot in the DOM (only the buttons are rebuilt) so it can animate
    nav.querySelectorAll('.nav-btn').forEach((x) => x.remove());
    const active = navId(app.current);
    if (!navDot) { navDot = h('i.nav-dot'); nav.append(navDot); }
    TABS.forEach((t) => nav.insertBefore(h('button.nav-btn' + (t.center ? '.center' : '') + (active === t.id ? '.on' : ''), {
      onclick: () => {
        GT.ui.haptic(8);
        if (t.id === 'more') return openMore();
        if (app.current !== t.id) go(t.id); else document.getElementById('view').scrollTo({ top: 0, behavior: 'smooth' });
      }, 'aria-label': t.label
    }, t.center ? h('span.center-orb', icon(t.icon, 26)) : [icon(t.icon, 22), h('span', t.label)]), navDot));
    requestAnimationFrame(() => {
      const on = nav.querySelector('.nav-btn.on');
      if (!on || on.classList.contains('center')) { navDot.style.opacity = 0; return; }
      navDot.style.opacity = 1; navDot.style.transform = `translateX(${on.offsetLeft + on.offsetWidth / 2 - 2}px)`;
    });
  }

  // Android back button. We keep one "guard" history entry on top; each back
  // press lands on popstate, we handle it in-app, then re-arm the guard.
  // Order: close a sheet → leave a More screen (to where you came from) → go to Today → exit app.
  window.addEventListener('popstate', () => {
    if (GT.ui.closeTopSheet()) return history.pushState({ guard: 1 }, '');
    if (isMoreKid(app.current)) { back(); return history.pushState({ guard: 1 }, ''); }
    if (app.current !== 'today') { go('today', {}, -1); return history.pushState({ guard: 1 }, ''); }
    history.back(); // already on Today: let Android close the app
  });

  // Swipe from the left edge on a More screen = back.
  let sx = null;
  document.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX < 24 && isMoreKid(app.current) ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (sx !== null && e.changedTouches[0].clientX - sx > 80) back(); sx = null; });

  // Save immediately when the app is hidden (switching apps, locking phone).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') GT.store.flushNow(); });
  window.addEventListener('pagehide', () => GT.store.flushNow());

  // Register the service worker for offline use (only works over http/https).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  // ---------- boot ----------
  GT.store.load().then(() => {
    GT.ui.applyTheme(GT.store.s.settings);
    app.logDate = app.snapDate = GT.store.todayKey();
    // Re-anchor dates when the app is reopened on a new day.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const t = GT.store.todayKey();
      if (app._lastDay && app._lastDay !== t) { app.logDate = app.snapDate = t; rerender(); }
      app._lastDay = t;
    });
    app._lastDay = GT.store.todayKey();
    document.getElementById('livebar').addEventListener('click', () => go('timer'));
    history.pushState({ guard: 1 }, '');
    go('today');
    document.body.classList.add('ready');
  });
})();
