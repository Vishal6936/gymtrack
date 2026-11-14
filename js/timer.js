/* =====================================================================
 * GymTrack v2 — timer.js
 * Timer engine + Timer tab + the floating "live bar" shown on other tabs.
 * Every clock is timestamp-based (Date.now() deltas), so it stays correct
 * when the phone sleeps or the app is backgrounded, and it is persisted so
 * a session survives the app being closed.
 * ===================================================================== */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});
  const { h, icon, fmtClock, ring, haptic, beep, toast } = GT.ui;
  const KEY = 'gymtrack_v2_timer';

  const blank = () => ({
    mode: 'session',
    session: { status: 'idle', startedAt: null, acc: 0, phaseIdx: 0, phaseStartedAt: null, phaseAcc: 0, finishedBeep: false, showRemaining: false },
    stopwatch: { status: 'idle', startedAt: null, acc: 0, laps: [] },
    countdown: { status: 'idle', startedAt: null, acc: 0 },
    rest: { status: 'idle', startedAt: null, target: 90 }
  });
  let T = blank();
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) T = Object.assign(blank(), saved); } catch (_) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch (_) {} };

  const now = () => Date.now();
  const running = (c) => c.status === 'running';
  const elapsed = (c) => c.acc + (running(c) ? now() - c.startedAt : 0);
  const layout = () => { const t = GT.store.s.timer; return t.layouts[t.selected] || t.layouts.default; };
  const phaseElapsed = () => T.session.phaseAcc + (running(T.session) ? now() - T.session.phaseStartedAt : 0);

  // ---------- screen wake lock (keeps the display on mid-session) ----------
  let wake = null;
  async function wakeOn() { if (!GT.store.s.settings.keepAwake || wake || !('wakeLock' in navigator)) return; try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (_) {} }
  function wakeOff() { if (wake && !anyRunning()) { wake.release().catch(() => {}); wake = null; } }
  const anyRunning = () => running(T.session) || running(T.stopwatch) || running(T.countdown) || running(T.rest);

  // ---------- session controls ----------
  function start(mode = T.mode) {
    const c = T[mode];
    if (mode === 'session' && c.status === 'idle') { c.phaseIdx = 0; c.phaseAcc = 0; c.finishedBeep = false; c.acc = 0; }
    if (mode === 'countdown' && c.status === 'done') { c.acc = 0; }
    if (c.status === 'done') { c.acc = 0; c.phaseIdx = 0; c.phaseAcc = 0; c.finishedBeep = false; }
    c.status = 'running'; c.startedAt = now();
    if (mode === 'session') c.phaseStartedAt = now();
    haptic(15); wakeOn(); persist(); tick(true);
  }
  function pause(mode = T.mode) {
    const c = T[mode]; if (!running(c)) return;
    c.acc += now() - c.startedAt; c.startedAt = null;
    if (mode === 'session') { c.phaseAcc += now() - c.phaseStartedAt; c.phaseStartedAt = null; }
    c.status = 'paused'; haptic(10); persist(); wakeOff(); tick(true);
  }
  function reset(mode = T.mode) {
    T[mode] = blank()[mode]; persist(); wakeOff(); tick(true);
  }
  function skipPhase() {
    const s = T.session; const L = layout();
    if (s.phaseIdx >= L.phases.length - 1) return;
    s.phaseIdx++; s.phaseAcc = 0; s.phaseStartedAt = running(s) ? now() : null;
    haptic([30, 40, 30]); persist(); tick(true);
  }
  // The timer is deliberately independent of Log: you may log at home or a
  // day later, so it never records workout duration.

  // ---------- rest timer ----------
  // Quick rest. If the phase timer is running you choose: pause it for the rest
  // (it resumes by itself when the rest ends) or let both run together.
  function startRest(sec) {
    if (running(T.session)) {
      const sh = GT.ui.sheet(`Rest ${sec < 60 ? sec + 's' : sec / 60 + ' min'}`, [
        h('button.option.rest-choice', { onclick: () => { sh.close(); pause('session'); beginRest(sec, true); } }, [h('div', [h('strong', 'Pause phase timer during rest'), h('small', 'The top timer stops and resumes automatically when the rest ends')]), icon('pause', 18)]),
        h('button.option.rest-choice', { onclick: () => { sh.close(); beginRest(sec, false); } }, [h('div', [h('strong', 'Run alongside'), h('small', 'Both timers keep running')]), icon('play', 18)])
      ]);
      return;
    }
    beginRest(sec, false);
  }
  function beginRest(sec, resume) {
    T.rest = { status: 'running', startedAt: now(), target: sec, resumeSession: resume };
    haptic(12); wakeOn(); persist(); tick(true);
  }
  // Ending a rest (finished, skipped or "Resume now") restarts a paused phase timer.
  function endRest() {
    const resume = T.rest.resumeSession;
    T.rest = { status: 'idle', startedAt: null, target: 0, resumeSession: false };
    if (resume && T.session.status === 'paused') start('session'); else { persist(); wakeOff(); tick(true); }
  }
  function stopRest() { endRest(); }
  function addRest(sec) { if (running(T.rest)) { T.rest.target = Math.max(5, T.rest.target + sec); persist(); tick(true); } }
  const restLeft = () => (running(T.rest) ? T.rest.target * 1000 - (now() - T.rest.startedAt) : 0);

  // ---------- the ticker ----------
  // Advances session phases, fires end-of-timer alerts, and redraws the
  // live bar + Timer tab. Runs 4×/second only while something is running.
  let ticker = null;
  const cues = {};
  function tick(force) {
    const s = T.session; const L = layout();
    if (running(s)) {
      const ph = L.phases[s.phaseIdx];
      if (ph && phaseElapsed() >= ph.sec * 1000 && s.phaseIdx < L.phases.length - 1) {
        // move into the next phase, carrying any overflow so time isn't lost
        const over = phaseElapsed() - ph.sec * 1000;
        s.phaseIdx++; s.phaseAcc = over; s.phaseStartedAt = now();
        beep(true); haptic([120, 80, 120]); toast(`Phase: ${L.phases[s.phaseIdx].name}`);
        persist();
      } else if (ph && s.phaseIdx === L.phases.length - 1 && phaseElapsed() >= ph.sec * 1000 && !s.finishedBeep) {
        s.finishedBeep = true; beep(true); haptic([200, 100, 200]); toast('Session time complete'); persist();
      }
    }
    // 3 short buzzes in the last 3 seconds of a phase / countdown / rest
    const cueFor = (msLeft, key) => { const sec = Math.ceil(msLeft / 1000); if (sec >= 1 && sec <= 3 && cues[key] !== sec) { cues[key] = sec; haptic(60); beep(false); } if (sec > 3) cues[key] = null; };
    if (running(s)) { const ph = L.phases[s.phaseIdx]; if (ph) cueFor(ph.sec * 1000 - phaseElapsed(), 'ph' + s.phaseIdx); }
    if (running(T.rest)) cueFor(restLeft(), 'rest');
    if (running(T.countdown)) cueFor((GT.store.s.timer.countdownSec || 60) * 1000 - elapsed(T.countdown), 'cd');
    const cd = T.countdown; const target = (GT.store.s.timer.countdownSec || 60) * 1000;
    if (running(cd) && elapsed(cd) >= target) { cd.acc = target; cd.status = 'done'; cd.startedAt = null; beep(true); haptic([200, 100, 200]); toast('Timer done'); persist(); wakeOff(); }
    if (running(T.rest) && restLeft() <= 0) { const resumed = T.rest.resumeSession; beep(true); haptic([150, 80, 150]); toast(resumed ? 'Rest over — phase timer resumed' : 'Rest over'); endRest(); return; }

    renderLiveBar();
    if (GT.app && GT.app.current === 'timer') updateTimerView();

    if (anyRunning() && !ticker) ticker = setInterval(() => tick(), 250);
    if (!anyRunning() && ticker) { clearInterval(ticker); ticker = null; }
  }

  // ---------- live bar (pinned to the top of every tab except Timer) ----------
  // Shows the current phase and the time left in it, so you always know where
  // you are in pre-stretch → gym → post-stretch without opening the Timer tab.
  function renderLiveBar() {
    const bar = document.getElementById('livebar'); if (!bar) return;
    const s = T.session; const L = layout();
    // only while a timer is actually in use: a finished countdown no longer keeps the bar up
    const active = s.status !== 'idle' || running(T.rest) || running(T.stopwatch) || running(T.countdown);
    const show = active && GT.app && GT.app.current !== 'timer';
    bar.classList.toggle('show', !!show);
    document.body.classList.toggle('has-live', !!show);
    if (!show) return;
    const kids = [];
    if (s.status !== 'idle') {
      const ph = L.phases[s.phaseIdx]; const nextPh = L.phases[s.phaseIdx + 1];
      const left = ph ? ph.sec * 1000 - phaseElapsed() : 0;
      const pct = ph ? Math.min(100, (phaseElapsed() / (ph.sec * 1000)) * 100) : 0;
      // one slim line: "Gym Session · 52:10 left"
      kids.push(
        h('span.live-dot' + (s.status === 'paused' ? '.paused' : '')),
        h('span.live-line', [h('span', `${ph ? ph.name : 'Session'} · `), h('strong.mono', left >= 0 ? fmtClock(left) + ' left' : '+' + fmtClock(-left) + ' over'), s.status === 'paused' ? h('span.muted', ' · paused') : null]),
        h('i.live-progress', { style: { width: pct + '%' } })
      );
    } else if (running(T.stopwatch)) kids.push(h('span.live-dot'), h('span.live-line', [h('span', 'Stopwatch · '), h('strong.mono', fmtClock(elapsed(T.stopwatch)))]));
    else if (running(T.countdown)) kids.push(h('span.live-dot'), h('span.live-line', [h('span', 'Timer · '), h('strong.mono', fmtClock((GT.store.s.timer.countdownSec * 1000) - elapsed(T.countdown)))]));
    if (running(T.rest)) kids.push(h('span.live-rest1', ['Rest ', h('strong.mono', fmtClock(restLeft()))]));
    // no rest running → the phase text sits centred; with a rest it goes left and the rest goes right
    bar.classList.toggle('centered', !running(T.rest));
    bar.innerHTML = ''; GT.ui.append(bar, kids);
  }

  // ---------- Timer tab ----------
  let view = null;
  function render(root) {
    const cfg = GT.store.s.timer; const L = layout();
    const modes = [['session', 'Session'], ['stopwatch', 'Stopwatch'], ['countdown', 'Timer']];
    view = {};
    root.append(
      h('header.top', [h('div', [h('h1', 'Timer')])]),
      h('div.seg', modes.map(([m, l]) => h('button' + (T.mode === m ? '.on' : ''), { onclick: () => { T.mode = m; persist(); GT.app.rerender(); } }, l))),
      // Session always runs the active layout from Plan → Timer sessions; it's edited there.
      T.mode === 'session' ? h('p.timer-caption', `${L.name} · ${Math.round(L.phases.reduce((a, p) => a + p.sec, 0) / 60)} min`) : null,
      view.dial = h('div.dial-wrap'),
      view.controls = h('div.timer-controls'),
      T.mode === 'countdown' && T.countdown.status === 'idle' ? countdownEditor() : null,
      T.mode === 'stopwatch' ? (view.laps = h('div.laps')) : null,
      restCard()
    );
    updateTimerView();
  }

  function countdownEditor() {
    const cfg = GT.store.s.timer;
    const presets = [30, 60, 90, 120, 300, 600];
    return h('div.card.glass', [h('p.field-label', 'Countdown length'), h('div.chips', presets.map((s) => h('button.chip' + (cfg.countdownSec === s ? '.on' : ''), { onclick: () => { cfg.countdownSec = s; GT.store.save(); GT.app.rerender(); } }, s < 60 ? `${s}s` : `${s / 60} min`))),
      h('div.row.gap', [h('input.field.mono', { type: 'number', inputmode: 'numeric', value: Math.floor(cfg.countdownSec / 60), 'aria-label': 'Minutes', onchange: (e) => { cfg.countdownSec = Math.max(1, Number(e.target.value) * 60 + (cfg.countdownSec % 60)); GT.store.save(); } }), h('span.muted', 'min'),
        h('input.field.mono', { type: 'number', inputmode: 'numeric', value: cfg.countdownSec % 60, 'aria-label': 'Seconds', onchange: (e) => { cfg.countdownSec = Math.max(1, Math.floor(cfg.countdownSec / 60) * 60 + Math.min(59, Number(e.target.value))); GT.store.save(); } }), h('span.muted', 'sec')])]);
  }

  function restCard() {
    const presets = [60, 90, 120, 180, 300];
    return h('div.quickrest', [
      h('p.section-label', 'Quick rest'),
      h('div.chips', presets.map((s) => h('button.chip', { onclick: () => startRest(s) }, s < 60 ? `${s}s` : `${s / 60 % 1 ? (s / 60).toFixed(1) : s / 60} min`))),
      view.rest = h('div.rest-live')
    ]);
  }

  // Redraws only the moving parts of the Timer tab (called by the ticker).
  function updateTimerView() {
    if (!view || !view.dial || !document.body.contains(view.dial)) return;
    const L = layout(); const m = T.mode; const c = T[m];
    let pct = 0, big = '00:00', label = '', sub = '', warm = false;
    if (m === 'session') {
      // Everything here is about the CURRENT PHASE only — there is no overall
      // session clock. Big number = time left in the phase (tap → time elapsed
      // in the phase); the ring fills for this phase and restarts at the next.
      const s = T.session; const ph = L.phases[s.phaseIdx] || L.phases[0];
      const pe = s.status === 'idle' ? 0 : phaseElapsed(); const left = ph.sec * 1000 - pe;
      pct = Math.min(100, (pe / (ph.sec * 1000)) * 100);
      big = s.showElapsed ? fmtClock(pe) : left >= 0 ? fmtClock(left) : '+' + fmtClock(-left);
      label = ph.name;
      sub = `${s.showElapsed ? 'elapsed' : left >= 0 ? 'left' : 'over'} · Phase ${s.phaseIdx + 1} of ${L.phases.length}`;
      warm = s.status !== 'idle' && left > 0 && left <= 10000; // last 10 s: arc warms to the second tone
    } else if (m === 'stopwatch') {
      big = fmtClock(elapsed(c)); pct = ((elapsed(c) / 1000) % 60) / 60 * 100; label = 'Stopwatch'; sub = c.laps.length ? `${c.laps.length} laps` : '';
    } else {
      const target = (GT.store.s.timer.countdownSec || 60) * 1000; const left = Math.max(0, target - elapsed(c));
      big = fmtClock(left); pct = (elapsed(c) / target) * 100; label = c.status === 'done' ? 'Done' : 'Timer'; sub = `of ${fmtClock(target)}`;
    }
    // Build the dial, buttons and rest panel only when their *state* changes;
    // every 250 ms tick just updates text and the ring. Rebuilding buttons on
    // every tick would swallow taps.
    const sig = `${m}|${c.status}|${m === 'session' ? T.session.phaseIdx + '|' + L.id : ''}`;
    if (view.sig !== sig) {
      view.sig = sig;
      view.dial.innerHTML = '';
      // bigger dial: phase name above, tappable time, "left · Phase 2 of 3" + dots below
      view.lbl = h('div.dial-phase'); view.big = h('button.dial-time.mono.gtext', { onclick: () => { if (m === 'session') { T.session.showElapsed = !T.session.showElapsed; persist(); updateTimerView(); } }, 'aria-label': 'Toggle time left / elapsed' }); view.sub = h('small.muted');
      const dots = m === 'session' ? h('div.phase-dots', L.phases.map((_, i) => h('i' + (i === T.session.phaseIdx ? '.on' : i < T.session.phaseIdx ? '.past' : '')))) : null;
      const center = h('div.dial-center', [view.lbl, view.big, view.sub, dots]);
      // the ring sits 14px inside its square so the arc tip + glow never get cut off
      const SIZE = 320, STROKE = 8, INSET = 14, R = (SIZE - STROKE) / 2 - INSET;
      view.dial.append(ring(0, SIZE, STROKE, 'var(--accent)', center, INSET));
      const svg = view.dial.querySelector('svg');
      // a faint watch-face of 60 ticks inside the ring
      const NSs = 'http://www.w3.org/2000/svg';
      for (let i = 0; i < 60; i++) { const a = (i / 60) * 2 * Math.PI; const r1 = R - 14, r2 = R - (i % 5 ? 18 : 22);
        const tk = document.createElementNS(NSs, 'line'); tk.setAttribute('x1', SIZE / 2 + Math.sin(a) * r1); tk.setAttribute('y1', SIZE / 2 - Math.cos(a) * r1); tk.setAttribute('x2', SIZE / 2 + Math.sin(a) * r2); tk.setAttribute('y2', SIZE / 2 - Math.cos(a) * r2); tk.setAttribute('class', 'tick-mark' + (i % 5 ? '' : ' major')); svg.insertBefore(tk, svg.firstChild.nextSibling); }
      // glowing dot that rides the tip of the arc
      view.tip = document.createElementNS(NSs, 'circle'); view.tip.setAttribute('r', 6); view.tip.setAttribute('class', 'arc-tip'); svg.append(view.tip);
      view.R = R; view.SIZE = SIZE;
      view.arc = view.dial.querySelector('.ring-arc'); view.arc.style.transition = 'stroke-dashoffset .25s linear';
      view.dial.classList.toggle('live', running(c));
      // controls
      view.controls.innerHTML = '';
      const primary = running(c)
        ? h('button.fab-big', { onclick: () => pause(), 'aria-label': 'Pause' }, icon('pause', 28))
        : h('button.fab-big.go', { onclick: () => start(), 'aria-label': 'Start' }, icon('play', 28));
      GT.ui.append(view.controls, [
        h('button.round', { onclick: async () => { if (c.status !== 'idle' && !(await GT.ui.confirm('Reset this timer?', 'Reset'))) return; reset(); }, 'aria-label': 'Reset' }, icon('reset')),
        primary,
        m === 'session' ? h('button.round', { onclick: skipPhase, disabled: c.status === 'idle', 'aria-label': 'Skip phase' }, icon('skip'))
          : m === 'stopwatch' ? h('button.round', { onclick: () => { if (running(c)) { c.laps.unshift(elapsed(c)); persist(); GT.app.rerender(); } }, 'aria-label': 'Lap' }, h('span.small', 'LAP'))
            : h('span.round.ghost')
      ]);
      if (view.laps) { view.laps.innerHTML = ''; c.laps.slice(0, 20).forEach((l, i, arr) => view.laps.append(h('div.lap', [h('span.muted', `Lap ${arr.length - i}`), h('span.mono', fmtClock(l))]))); }
    }
    if (view.lbl.textContent !== label) { view.lbl.textContent = label; view.lbl.classList.remove('swap'); void view.lbl.offsetWidth; view.lbl.classList.add('swap'); } // cross-fade on phase change
    view.big.textContent = big; view.sub.textContent = sub;
    const pc = Math.min(100, Math.max(0, pct)); const circ = 2 * Math.PI * view.R;
    view.arc.setAttribute('stroke-dashoffset', circ * (1 - pc / 100));
    const ang = (pc / 100) * 2 * Math.PI; view.tip.setAttribute('cx', view.SIZE / 2 + Math.sin(ang) * view.R); view.tip.setAttribute('cy', view.SIZE / 2 - Math.cos(ang) * view.R);
    view.tip.style.opacity = c.status === 'idle' || pc <= 0 ? 0 : 1;
    view.dial.classList.toggle('warm', warm);

    // rest panel
    if (view.rest) {
      const rsig = running(T.rest) ? 'on|' + T.rest.resumeSession : 'off';
      if (view.rsig !== rsig) {
        view.rsig = rsig; view.rest.innerHTML = '';
        if (running(T.rest)) {
          view.rbar = h('div'); view.rtime = h('strong.mono.big');
          GT.ui.append(view.rest, [h('div.rest-bar', view.rbar),
            h('div.row.between', [view.rtime, h('div.row.gap', [h('button.chip', { onclick: () => addRest(-15) }, '−15'), h('button.chip', { onclick: () => addRest(30) }, '+30'), h('button.chip.on', { onclick: stopRest }, T.rest.resumeSession ? 'Resume now' : 'Stop')])]),
            T.rest.resumeSession ? h('small.muted', 'Phase timer paused — resumes when rest ends') : null]);
        }
      }
      if (running(T.rest)) { const left = restLeft(); view.rbar.style.width = Math.max(0, (left / (T.rest.target * 1000)) * 100) + '%'; view.rtime.textContent = fmtClock(left); }
    }
  }

  // keep phases correct when returning from background
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (anyRunning()) wakeOn(); tick(true); } else persist(); });

  GT.timer = { render, tick, start, pause, reset, startRest, stopRest, addRest, restLeft, isResting: () => running(T.rest), state: () => T };
})();
