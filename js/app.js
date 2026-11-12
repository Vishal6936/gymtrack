/* =====================================================================
 * GymTrack v2 — app.js
 * Shell: boots the store, draws the bottom bar, routes between screens,
 * handles the Android back button / swipe-back, and registers offline mode.
 * Bottom bar: Today · Snapshot · Activity · [Log] · Timer · Plan · Progress
 * Settings opens from the gear on Today.
 * ===================================================================== */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon } = GT.ui;

  const TABS = [
    { id: 'today', label: 'Today', icon: 'home' },
    { id: 'snapshot', label: 'Snapshot', icon: 'snap' },
    { id: 'activity', label: 'Activity', icon: 'cal' },
    { id: 'log', label: 'Log', icon: 'log', center: true },
    { id: 'timer', label: 'Timer', icon: 'timer' },
    { id: 'plan', label: 'Plan', icon: 'plan' },
    { id: 'progress', label: 'Progress', icon: 'chart' }
  ];
  // Settings opens from the gear on Today; it shows a back arrow instead of a tab.
  const PUSHED = { settings: 'today' };

  const app = (GT.app = {
    current: 'today',
    logDate: null,       // Log and Snapshot keep separate dates (v1 shared one)
    snapDate: null,
    params: {},
    go, rerender, back
  });

  function screenFor(id) {
    return { today: GT.today, snapshot: GT.snapshot, log: GT.log, activity: GT.activity, timer: GT.timer, plan: GT.plan, progress: GT.progress, settings: GT.settings }[id];
  }

  // Navigate to a screen. dir: 1 = forward (slide left), -1 = back.
  function go(id, params = {}, dir = 0) {
    const prev = app.current;
    app.current = id; app.params = params;
    draw(dir || (PUSHED[id] ? 1 : TABS.findIndex((t) => t.id === id) >= TABS.findIndex((t) => t.id === prev) ? 1 : -1));
  }
  function back() { if (PUSHED[app.current]) go(PUSHED[app.current], {}, -1); }
  function rerender() { draw(0); }

  function draw(dir) {
    const view = document.getElementById('view');
    const keepScroll = dir === 0 ? view.scrollTop : 0;
    const next = h('div.screen' + (dir ? (dir > 0 ? '.enter-r' : '.enter-l') : ''), { 'data-screen': app.current });
    // Screens call root.append(a, cond ? b : null, …); skip the nulls instead
    // of letting the DOM print the word "null".
    next.append = (...kids) => GT.ui.append(next, kids);
    try { screenFor(app.current).render(next, app.params); }
    catch (e) { console.error(e); next.append(h('div.card.glass', [h('h3', 'Something went wrong'), h('p.muted.small', String(e && e.message))])); }
    view.innerHTML = ''; view.append(next); view.scrollTop = keepScroll;
    drawNav();
    GT.timer.tick(true); // refresh live bar visibility for this tab
  }

  // The small dot under the active tab is ONE element that glides between tabs.
  let navDot = null;
  function drawNav() {
    const nav = document.getElementById('nav');
    // keep the dot in the DOM (only the buttons are rebuilt) so it can animate
    nav.querySelectorAll('.nav-btn').forEach((x) => x.remove());
    const active = PUSHED[app.current] || app.current;
    if (!navDot) { navDot = h('i.nav-dot'); nav.append(navDot); }
    TABS.forEach((t) => nav.insertBefore(h('button.nav-btn' + (t.center ? '.center' : '') + (active === t.id ? '.on' : ''), {
      onclick: () => { GT.ui.haptic(8); if (app.current !== t.id) go(t.id); else document.getElementById('view').scrollTo({ top: 0, behavior: 'smooth' }); }, 'aria-label': t.label
    }, t.center ? h('span.center-orb', icon(t.icon, 26)) : [icon(t.icon, 22), h('span', t.label)]), navDot));
    requestAnimationFrame(() => {
      const on = nav.querySelector('.nav-btn.on');
      if (!on || on.classList.contains('center')) { navDot.style.opacity = 0; return; }
      navDot.style.opacity = 1; navDot.style.transform = `translateX(${on.offsetLeft + on.offsetWidth / 2 - 2}px)`;
    });
  }

  // Android back button. We keep one "guard" history entry on top; each back
  // press lands on popstate, we handle it in-app, then re-arm the guard.
  // Order: close a sheet → leave a pushed screen → go to Today → exit app.
  window.addEventListener('popstate', () => {
    if (GT.ui.closeTopSheet()) return history.pushState({ guard: 1 }, '');
    if (PUSHED[app.current]) { back(); return history.pushState({ guard: 1 }, ''); }
    if (app.current !== 'today') { go('today', {}, -1); return history.pushState({ guard: 1 }, ''); }
    history.back(); // already on Today: let Android close the app
  });

  // Swipe from the left edge on a pushed screen = back.
  let sx = null;
  document.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX < 24 && PUSHED[app.current] ? e.touches[0].clientX : null; }, { passive: true });
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
