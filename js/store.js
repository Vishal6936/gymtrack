/* =====================================================================
 * GymTrack v2 — store.js
 * The data layer: state shape, persistence, v1 import, and every
 * derived number the screens show (streaks, completion, history, PRs).
 * Screens never touch storage directly; they call GT.store.* and then
 * GT.store.save() so all writes go through one place.
 * ===================================================================== */
(function () {
  'use strict';
  const GT = (window.GT = window.GT || {});

  const LS_KEY = 'gymtrack_v2';          // localStorage mirror (fast, synchronous boot)
  const IDB_NAME = 'gymtrack_v2_db';     // IndexedDB copy (more durable than localStorage)
  const V1_KEY = 'gymTrackAI_v17';       // the old app's key, for automatic migration
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DEFAULT_MUSCLES = ['Chest', 'Back', 'Lats', 'Shoulders', 'Rear Delts', 'Traps', 'Biceps', 'Triceps', 'Forearms', 'Legs', 'Calves', 'Abs', 'Cardio', 'Other'];

  // ---------- small utilities ----------
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // Dates are always local "YYYY-MM-DD" strings. Parsing goes through
  // new Date(y, m-1, d) so the browser never shifts the day via UTC.
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
  const weekday = (k) => DAYS[(parseKey(k).getDay() + 6) % 7]; // JS Sunday=0 → our Monday-first list
  const todayKey = () => dateKey(new Date());

  // Loose name matching carried over from v1: "Dumbbell" = "DB", "Pull-down" = "Pulldown", etc.
  const canon = (name) => String(name || '').toLowerCase()
    .replace(/dumbbell/g, 'db').replace(/pec\s*dec(k)?/g, 'pec deck').replace(/t[-\s]?bar/g, 't bar')
    .replace(/pull[-\s]?down/g, 'pulldown').replace(/single[-\s]?hand/g, 'single hand')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  // Best-guess muscle for exercises that arrive without one (imports, quick adds).
  function guessMuscle(name) {
    const n = String(name).toLowerCase();
    if (/(calf)/.test(n)) return 'Calves';
    if (/(leg press|lunge|squat|leg extension|leg curl|glute|hamstring|quad|thigh|adductor|abductor)/.test(n)) return 'Legs';
    if (/(rear delt|face pull|reverse pec)/.test(n)) return 'Rear Delts';
    if (/(shrug|upright row)/.test(n)) return 'Traps';
    if (/(pulldown|pull-up|chin-up|lat )/.test(n)) return 'Lats';
    if (/(row|deadlift)/.test(n)) return 'Back';
    if (/(shoulder press|side raise|lateral|front .*raise|arnold|arm circle|delt)/.test(n)) return 'Shoulders';
    if (/(curl)/.test(n)) return 'Biceps';
    if (/(tricep|pushdown|skull|kickback|dip|close grip)/.test(n)) return 'Triceps';
    if (/(bench|press|fly|crossover|pec|push-up)/.test(n)) return 'Chest';
    if (/(crunch|plank|leg raise|abs|core)/.test(n)) return 'Abs';
    if (/(forearm|wrist|grip)/.test(n)) return 'Forearms';
    if (/(run|bike|cardio|treadmill|elliptical)/.test(n)) return 'Cardio';
    return 'Other';
  }

  // ---------- default data (your v1 split, rebuilt with exercise IDs) ----------
  const DEFAULT_PLAN = {
    Monday: ['Back, Biceps, Rear Delts, Lats', ['Back', 'Biceps', 'Rear Delts', 'Lats'], ['Cable Rows Wide - MAG Grip', 'Chest Supported Rows', 'Lat Pulldown MAG Narrow', 'Angled Single-Hand Cable Row', 'Barbell Curl', 'Unilateral Bicep Curl (DB)', 'Preacher Curl', 'Cable Curl', 'Cable Rear Delt Fly', 'Straight Bar Pulldown']],
    Tuesday: ['Legs, Calves, Triceps', ['Legs', 'Calves', 'Triceps'], ['Leg Press', 'Int Ext Thighs', 'DB Lunges', 'Laying Leg Curl', 'Seated Calf Raise', 'Cable Kickbacks', 'DB Skull Crusher', 'Close Grip Bench Press', 'Leg Extension', 'Rope Pushdown']],
    Wednesday: ['Traps, Chest, Shoulders', ['Traps', 'Chest', 'Shoulders'], ['Barbell Flat Bench Press', 'Barbell Incline Press', 'Incline DB Hammer Press', 'Decline Cable Crossover', 'DB Shoulder Press', 'Cable Side Raise', 'Front Delt Cable Raise', 'Upright Rows Side Delts', 'DB Shrugs', 'Chest Press Machine']],
    Thursday: ['Back, Biceps, Rear Delts', ['Back', 'Biceps', 'Rear Delts'], ['Cable Rows (Wide - Reverse)', 'T-Bar Rows', 'Lat Pulldown - Wide MAG 2', 'Lat Pulldown Machine', 'DB Hammer Curl', 'Unilateral Bicep Curl (Cable)', 'Preacher Curl', 'Reverse Pec Deck', 'Cable Curl', 'Rows Machine MAG Narrow']],
    Friday: ['Legs, Calves, Traps, Triceps', ['Legs', 'Calves', 'Traps', 'Triceps'], ['Leg Press', 'Smith Squat', 'Laying Leg Curl', 'Seated Calf Raise', 'Cable Kickbacks', 'Cable / Bar Overhead Triceps Extension', 'Reverse Grip Single Arm + Single Hand Pushdown', 'Rope Upright Rows - 3 Types', 'Leg Extension', 'Bar Pushdown']],
    Saturday: ['Shoulders, Chest, Biceps', ['Shoulders', 'Chest', 'Biceps'], ['Smith Shoulder Press', 'DB Arm Circles', 'Arnold Press', 'Front DB Raise', 'DB Flat Press', 'Incline DB Press', 'Decline Cable Crossover', 'DB Hammer Curl', 'Pec Dec Fly', 'DB Side Raise']],
    Sunday: ['Rear Delts & Traps', ['Rear Delts', 'Traps'], ['Cable Rear Delt Fly', 'Reverse Pec Deck', 'Cable Rope Face Pull', 'DB Shrugs', 'Rope Upright Rows - 3 Types', 'Reverse-Grip Barbell Shrugs']]
  };

  function blankState() {
    return {
      v: 2,
      settings: {
        unit: 'kg', dist: 'cm', theme: 'pearl-gold', accent: 'pearl', highlight: 'gold', progression: 2.5,
        restSec: 90, autoRest: true, sound: true, vibrate: true, keepAwake: true,
        height: null, lastBackup: null, backupEveryDays: 7
      },
      muscles: DEFAULT_MUSCLES.slice(),
      exercises: {},     // id -> { id, name, muscle }
      plan: {},          // weekday -> { name, muscles[], items[{ exId, sets, reps }] }
      routines: {},      // id -> { id, name, items[] }  (e.g. "Arms Annihilation")
      timer: {
        selected: 'default', countdownSec: 60,
        layouts: { default: { id: 'default', name: 'Default', locked: true, phases: [{ name: 'Pre-workout', sec: 900 }, { name: 'Gym Session', sec: 4200 }, { name: 'Post-workout', sec: 300 }] } }
      },
      workouts: {},      // date -> Workout (see makeWorkout)
      omitted: {},       // date -> true  (day excluded from streak / completion)
      body: { parts: ['Weight', 'Neck', 'Chest', 'Waist', 'Hips'], logs: {}, goals: {} },
      meta: { createdAt: Date.now(), importedV1At: null }
    };
  }

  function seedDefaults(s) {
    DAYS.forEach((day) => {
      const [name, muscles, names] = DEFAULT_PLAN[day];
      s.plan[day] = { name, muscles, items: names.map((n) => ({ exId: ensureExercise(s, n).id, sets: 3, reps: 12 })) };
    });
  }

  // Find an exercise by loose name, or create it. Returns the exercise record.
  function ensureExercise(s, name, muscle) {
    const key = canon(name);
    const found = Object.values(s.exercises).find((e) => canon(e.name) === key);
    if (found) return found;
    const ex = { id: uid('ex'), name: String(name).trim(), muscle: muscle || guessMuscle(name) };
    s.exercises[ex.id] = ex;
    if (!s.muscles.includes(ex.muscle)) s.muscles.push(ex.muscle);
    return ex;
  }

  // ---------- persistence ----------
  let state = null;
  let saveTimer = null;
  const listeners = new Set();

  function idbOpen() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function idbSet(value) {
    try {
      const db = await idbOpen();
      await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, 'state'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (_) { /* localStorage mirror still has it */ }
  }
  async function idbGet() {
    try {
      const db = await idbOpen();
      return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('state'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
    } catch (_) { return null; }
  }

  // Writes are debounced (typing fast in a set row = one write), but flushNow()
  // is called when the app goes to the background so nothing is lost.
  // Every change is written to localStorage immediately (so closing the app
  // a split-second after typing loses nothing); the IndexedDB copy follows
  // a moment later in the background.
  function save() {
    firstMemo.n = -1; // a new log may change the first-workout date
    const json = JSON.stringify(state);
    try { localStorage.setItem(LS_KEY, json); } catch (_) { GT.ui && GT.ui.toast('Storage is full — export a backup', 'error'); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => idbSet(json), 400);
    listeners.forEach((fn) => fn());
  }
  function flushNow() {
    clearTimeout(saveTimer);
    const json = JSON.stringify(state);
    try { localStorage.setItem(LS_KEY, json); } catch (_) { GT.ui && GT.ui.toast('Storage is full — export a backup', 'error'); }
    idbSet(json);
  }

  async function load() {
    // Prefer the IndexedDB copy; fall back to the localStorage mirror.
    let raw = await idbGet();
    if (!raw) raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = normalize(JSON.parse(raw));
    } else {
      state = blankState();
      // First run on the same origin as v1? Migrate automatically.
      const v1 = localStorage.getItem(V1_KEY);
      if (v1) { try { state = importV1(JSON.parse(v1)); } catch (e) { console.warn('v1 migration failed', e); seedDefaults(state); } }
      else seedDefaults(state);
      flushNow();
    }
    freezePastDays();
    // Ask the browser not to evict our data under storage pressure.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    return state;
  }

  // Fill any fields missing from older saves so screens can rely on them.
  function normalize(s) {
    const b = blankState();
    s.settings = Object.assign(b.settings, s.settings || {});
    ['muscles', 'exercises', 'plan', 'routines', 'timer', 'workouts', 'omitted', 'body', 'meta'].forEach((k) => { if (!s[k]) s[k] = b[k]; });
    s.body = Object.assign(b.body, s.body);
    if (!s.timer.layouts || !s.timer.layouts.default) s.timer.layouts = Object.assign(b.timer.layouts, s.timer.layouts || {});
    DAYS.forEach((d) => { if (!s.plan[d]) s.plan[d] = { name: 'Rest Day', muscles: [], items: [] }; });
    // Older v2 saves ticked each set; convert to the single exercise tick.
    const ok = (st) => Number(st.r) > 0 && st.w !== '' && Number(st.w) >= 0;
    Object.values(s.workouts).forEach((w) => w.entries.forEach((e) => { if (e.done === undefined) e.done = e.sets.some((st) => st.done && ok(st)); }));
    return s;
  }

  // ---------- v1 import ----------
  // Converts a GymTrack v1 export (or its localStorage blob) into v2 state.
  // Nothing from your history is dropped: workouts, swaps, omitted days,
  // measurements, goals, saved workouts, timer sessions and settings all map over.
  function importV1(v1) {
    const s = blankState();
    const set1 = v1.settings || {};
    Object.assign(s.settings, {
      unit: set1.weightUnit === 'lbs' ? 'lbs' : 'kg', dist: set1.distanceUnit === 'in' ? 'in' : 'cm',
      height: set1.height || null, progression: Number(set1.progression) || 2.5,
      sound: set1.timer?.soundEnabled ?? true, vibrate: set1.timer?.vibrationEnabled ?? true, keepAwake: set1.timer?.keepScreenAwake !== false
    });
    (v1.customMuscleGroups || []).forEach((m) => { if (!s.muscles.includes(m)) s.muscles.push(m); });
    (v1.exerciseDatabase || []).forEach((e) => ensureExercise(s, e.name, mapMuscle(e.muscle, e.name)));

    const items = (arr) => (arr || []).filter((e) => e && e.name).map((e) => ({ exId: ensureExercise(s, e.name).id, sets: clampInt(e.sets, 1, 10, 3), reps: clampInt(e.reps, 1, 100, 12) }));

    // Weekly plan + muscle split
    const wp = v1.weeklyPlans?.default?.plan;
    DAYS.forEach((d) => {
      const day = wp?.[d];
      s.plan[d] = { name: day?.name || 'Rest Day', muscles: (v1.weeklyMuscleSplits?.[d] || []).slice(), items: items(day?.exercises) };
    });
    if (!wp) seedDefaults(s);

    // Saved workouts → routines
    Object.entries(v1.customWorkouts || {}).forEach(([name, w]) => { const id = uid('rt'); s.routines[id] = { id, name, items: items(w.exercises) }; });

    // Timer sessions
    const tl = v1.settings?.timer;
    if (tl?.layouts) {
      s.timer.layouts = {};
      Object.values(tl.layouts).forEach((l) => { if (l) s.timer.layouts[l.id] = { id: l.id, name: l.name, locked: !!l.protected, phases: (l.phases || []).map((p) => ({ name: p.name, sec: Number(p.durationSeconds) || 60 })) }; });
      if (!s.timer.layouts.default) s.timer.layouts.default = blankState().timer.layouts.default;
      s.timer.selected = s.timer.layouts[tl.selectedLayoutId] ? tl.selectedLayoutId : 'default';
      s.timer.countdownSec = Number(tl.countdownTargetSeconds) || 60;
    }

    // Workouts
    const daily = v1.logs?.daily || {};
    const dates = new Set([...Object.keys(v1.logs?.workouts || {}), ...Object.keys(daily).filter((d) => daily[d]?.workoutSelection)]);
    dates.forEach((date) => {
      const log = v1.logs?.workouts?.[date];
      const sel = daily[date]?.workoutSelection;
      const plannedSrc = sel?.plannedExercises || log?.plannedExercisesSnapshot || wp?.[weekday(date)]?.exercises || [];
      const w = makeWorkoutRaw(date, items(plannedSrc));
      const own = s.plan[weekday(date)];
      w.source.name = own.name; w.source.muscles = clone(own.muscles); // use the imported plan, not the current state
      if (sel || log?.sourceType === 'custom' || log?.sourceDay) {
        const day = sel?.sourceDay || log?.sourceDay;
        w.source = sel?.type === 'custom' || log?.sourceType === 'custom'
          ? { type: 'routine', label: sel?.workoutName || log?.workoutName || 'Saved workout', name: sel?.workoutName || log?.workoutName || 'Saved workout', muscles: [] }
          : { type: 'day', label: day || weekday(date), day, name: s.plan[day]?.name || log?.workoutName || day, muscles: clone(s.plan[day]?.muscles || []) };
      }
      const used = new Set();
      (log?.exercises || []).forEach((ex) => {
        const exId = ensureExercise(s, ex.name).id;
        const fromId = ex.substitutedFor ? ensureExercise(s, ex.substitutedFor).id : null;
        // Attach the logged exercise to the planned slot it fulfilled (by name or by swap).
        const target = fromId || exId;
        let planIdx = w.planned.findIndex((p, i) => !used.has(i) && p.exId === target);
        if (planIdx >= 0) used.add(planIdx); else planIdx = null;
        w.entries.push({ uid: uid('en'), exId, swappedFrom: fromId, planIdx, note: '', done: true, sets: (ex.sets || []).map((st) => ({ w: num(st.weight), r: num(st.reps), done: true, t: 'n' })) });
      });
      if (log) w.finishedAt = parseKey(date).getTime() + 20 * 3600e3; // historical: mark finished
      s.workouts[date] = w;
    });
    Object.entries(daily).forEach(([d, v]) => { if (v?.skipped?.omitFromStreak) s.omitted[d] = true; });

    // Body measurements + goals
    s.body.parts = ['Weight', 'Neck', 'Chest', 'Waist', 'Hips', ...(v1.customBodyParts || [])];
    Object.entries(v1.logs?.measurements || {}).forEach(([d, m]) => { if (m?.data && Object.keys(m.data).length) s.body.logs[d] = Object.assign({}, m.data); });
    (v1.goals || []).forEach((g) => { if (g?.name) s.body.goals[g.name] = Number(g.target); });

    s.meta.importedV1At = Date.now();
    return normalize(s);
  }
  // v1 used "Delts" for rear delts; v2 names it explicitly.
  const mapMuscle = (m, name) => (m === 'Delts' ? 'Rear Delts' : m && m !== 'Other' ? m : guessMuscle(name));
  const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo ? Math.min(hi, n) : d; };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : ''; };

  // Accepts either a v1 export or a v2 backup file and replaces current state.
  function importAny(text) {
    const data = JSON.parse(text);
    if (data && data.v === 2 && data.exercises) state = normalize(data);
    else if (data && (data.logs || data.weeklyPlans)) state = importV1(data);
    else throw new Error('Not a GymTrack backup');
    freezePastDays();
    flushNow();
    listeners.forEach((fn) => fn());
  }

  // ---------- workouts ----------
  // Each workout keeps its own copy of the planned list AND the name/muscles it
  // had that day, so renaming or editing the plan later never rewrites history.
  function makeWorkoutRaw(date, planned) {
    const p = state && state.plan[weekday(date)];
    return { date, source: { type: 'plan', label: weekday(date), name: p ? p.name : null, muscles: p ? clone(p.muscles || []) : [] }, planned, entries: [], finishedAt: null };
  }

  // The exercises a date is *supposed* to have: the workout's own list once it
  // exists (it may have been switched to another day/routine), else the weekly plan.
  function plannedFor(date) {
    const w = state.workouts[date];
    if (w) return w.planned;
    return state.plan[weekday(date)]?.items || [];
  }
  function dayLabel(date) {
    const w = state.workouts[date];
    if (w && w.source.name) return w.planned.length || w.entries.length ? w.source.name : 'Rest Day';
    if (w && w.source.type === 'routine') return w.source.label;
    if (w && w.source.type === 'day') return state.plan[w.source.day]?.name || w.source.label;
    const p = state.plan[weekday(date)];
    return p && p.items.length ? p.name : 'Rest Day';
  }
  function musclesFor(date) {
    const w = state.workouts[date];
    if (w && w.source.muscles && w.source.muscles.length) return w.source.muscles;
    if (w && w.source.type === 'day') return state.plan[w.source.day]?.muscles || [];
    if (w && w.source.type === 'routine') return [...new Set(w.planned.map((p) => state.exercises[p.exId]?.muscle).filter(Boolean))];
    return state.plan[weekday(date)]?.muscles || [];
  }

  // Create the workout for a date on demand, with one entry per planned
  // exercise and empty set rows sized by the plan's set count.
  function ensureWorkout(date) {
    if (!state.workouts[date]) {
      const w = makeWorkoutRaw(date, clone(state.plan[weekday(date)]?.items || []));
      state.workouts[date] = w;
    }
    const w = state.workouts[date];
    let added = false;
    w.planned.forEach((p, i) => {
      if (!w.entries.some((e) => e.planIdx === i)) { w.entries.push(newEntry(p.exId, p.sets, i, p.reps)); added = true; }
    });
    // Put new entries in plan order (extras after). Once the day exists, its
    // order is whatever you drag it to, so we only sort when entries were added.
    if (added) w.entries.sort((a, b) => (a.planIdx ?? 999) - (b.planIdx ?? 999));
    return w;
  }
  function newEntry(exId, sets = 3, planIdx = null, reps = '') {
    return { uid: uid('en'), exId, swappedFrom: null, planIdx, note: '', done: false, targetReps: reps || '', sets: Array.from({ length: sets }, () => ({ w: '', r: '', done: false, t: 'n' })) };
  }

  // Switch a date to another weekday's plan or a routine. mode 'replace' drops
  // untouched entries; mode 'add' appends the new exercises as extras.
  function switchWorkout(date, src, mode) {
    const items = src.type === 'routine' ? state.routines[src.id].items : state.plan[src.day].items;
    const w = ensureWorkout(date);
    if (mode === 'add') {
      items.forEach((it) => w.entries.push(newEntry(it.exId, it.sets, null, it.reps)));
    } else {
      const keep = w.entries.filter(entryLogged); // never throw away logged sets
      keep.forEach((e) => { e.planIdx = null; });
      w.planned = clone(items);
      w.entries = keep;
      // remember the name + muscles as they were at swap time
      if (src.type === 'routine') { const r = state.routines[src.id]; w.source = { type: 'routine', label: r.name, id: src.id, name: r.name, muscles: [...new Set(r.items.map((i) => state.exercises[i.exId]?.muscle).filter(Boolean))] }; }
      else { const p = state.plan[src.day]; w.source = src.day === weekday(date) ? { type: 'plan', label: src.day, name: p.name, muscles: clone(p.muscles || []) } : { type: 'day', label: src.day, day: src.day, name: p.name, muscles: clone(p.muscles || []) }; }
      ensureWorkout(date);
    }
  }

  // After a weekly-plan edit, push the change into today's and future workouts
  // that still follow the plan, so "3 → 4 sets" shows up in Log immediately.
  // Logged entries are never touched; only their plan slot is re-matched.
  function syncPlanToOpenWorkouts() {
    const t = todayKey();
    Object.values(state.workouts).forEach((w) => {
      if (w.date < t || w.source.type !== 'plan') return;
      const items = clone(state.plan[weekday(w.date)]?.items || []);
      const logged = w.entries.filter((e) => entryLogged(e) || e.planIdx === null);
      const used = new Set();
      logged.forEach((e) => {
        const target = e.swappedFrom || e.exId;
        const i = items.findIndex((p, k) => !used.has(k) && p.exId === target);
        e.planIdx = i >= 0 ? (used.add(i), i) : null;
      });
      w.planned = items;
      w.entries = logged;
      const p = state.plan[weekday(w.date)]; w.source.name = p.name; w.source.muscles = clone(p.muscles || []);
      ensureWorkout(w.date);
    });
  }

  // When the app opens, give every past day that was never opened its own frozen
  // copy of the plan as it is now. From then on, editing the weekly plan can't
  // re-score old missed days. Runs only over days not yet frozen.
  function freezePastDays() {
    const yesterday = addDays(todayKey(), -1);
    let d = state.meta.frozenThrough ? addDays(state.meta.frozenThrough, 1) : firstDay();
    let n = 0;
    for (; d <= yesterday && n < 800; d = addDays(d, 1), n++) {
      if (!state.workouts[d]) state.workouts[d] = makeWorkoutRaw(d, clone(state.plan[weekday(d)]?.items || []));
    }
    if (state.meta.frozenThrough !== yesterday) { state.meta.frozenThrough = yesterday; flushNow(); }
  }

  // ---------- set / entry rules ----------
  // A set counts only when reps > 0 AND a weight was actually typed (0 is
  // allowed for bodyweight). This fixes v1, where a blank weight read as 0.
  // An exercise counts once its single tick (e.done) is on — it turns on by
  // itself when every set row has weight + reps, or you tap it.
  const setValid = (st) => Number(st.r) > 0 && st.w !== '' && st.w !== null && Number.isFinite(Number(st.w)) && Number(st.w) >= 0;
  const entryLogged = (e) => !!e.done && e.sets.some(setValid);
  const entryComplete = (e) => !!e.done;
  const doneSets = (e) => (e.done ? e.sets.filter(setValid) : []);
  const volumeOf = (sets) => sets.reduce((a, st) => a + Number(st.w) * Number(st.r), 0);

  const hasWorkout = (date) => !!state.workouts[date]?.entries.some(entryLogged);
  const isRestDay = (date) => plannedFor(date).length === 0 || (state.plan[weekday(date)]?.muscles || []).includes('Rest');

  // First day with a logged workout. Days before it are "before you started",
  // not missed days (memoised; recomputed when the number of workouts changes).
  let firstMemo = { n: -1, d: null };
  function firstDay() {
    const n = Object.keys(state.workouts).length;
    if (firstMemo.n !== n) firstMemo = { n, d: Object.keys(state.workouts).filter(hasWorkout).sort()[0] || todayKey() };
    return firstMemo.d;
  }

  // Completion % for a date, or null when it shouldn't count (rest, omitted, future, before you started).
  function completion(date) {
    if (date > todayKey() || state.omitted[date] || date < firstDay()) return null;
    const planned = plannedFor(date);
    if (!planned.length) return null;
    const w = state.workouts[date];
    if (!w) return 0;
    const done = planned.filter((_, i) => w.entries.some((e) => e.planIdx === i && entryLogged(e))).length;
    return Math.round((done / planned.length) * 100);
  }
  function plannedDoneCount(date) {
    const planned = plannedFor(date); const w = state.workouts[date];
    const done = w ? planned.filter((_, i) => w.entries.some((e) => e.planIdx === i && entryLogged(e))).length : 0;
    return { done, total: planned.length };
  }

  // Day status for calendars: 'logged' | 'missed' | 'rest' | 'omitted' | 'future' | 'today'
  function dayStatus(date) {
    if (state.omitted[date]) return 'omitted';
    if (hasWorkout(date)) return 'logged';
    if (date > todayKey()) return 'future';
    if (date < firstDay()) return 'before';
    if (isRestDay(date)) return 'rest';
    return date === todayKey() ? 'today' : 'missed';
  }

  // ---------- streaks (same rules as v1) ----------
  // Omitted days are transparent; rest days keep the streak alive; today only
  // counts once something is logged; a missed planned day breaks it.
  function currentStreak() {
    let streak = 0; let d = todayKey();
    for (let i = 0; i < 730; i++, d = addDays(d, -1)) {
      if (d < firstDay()) break;
      if (state.omitted[d]) continue;
      if (i === 0 && !hasWorkout(d)) continue;
      if (hasWorkout(d) || isRestDay(d)) { streak++; continue; }
      break;
    }
    return streak;
  }
  function longestStreak() {
    const first = Object.keys(state.workouts).filter(hasWorkout).sort()[0];
    if (!first) return 0;
    let best = 0; let run = 0; const end = todayKey();
    for (let d = first; d <= end; d = addDays(d, 1)) {
      if (state.omitted[d]) continue;
      if (hasWorkout(d) || isRestDay(d)) { run++; best = Math.max(best, run); }
      else if (d !== end) run = 0;
    }
    return best;
  }

  // ---------- exercise history, PRs, suggestions ----------
  // Newest-first list of { date, sets[] } for one exercise (done, valid sets only).
  function history(exId) {
    const out = [];
    Object.keys(state.workouts).sort().reverse().forEach((date) => {
      const sets = state.workouts[date].entries.filter((e) => e.exId === exId).flatMap(doneSets);
      if (sets.length) out.push({ date, sets: sets.map((st) => ({ w: Number(st.w), r: Number(st.r), t: st.t })) });
    });
    return out;
  }
  const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley estimate
  function prFor(exId) {
    const h = history(exId); if (!h.length) return null;
    let maxW = { v: -1 }, best1rm = { v: -1 }, bestSet = { v: -1 };
    h.forEach(({ date, sets }) => sets.forEach((st, i) => {
      if (st.w > maxW.v) maxW = { v: st.w, r: st.r, date };
      const e = e1rm(st.w, st.r); if (e > best1rm.v) best1rm = { v: e, date };
      const vol = st.w * st.r; if (vol >= bestSet.v) bestSet = { v: vol, date, i, w: st.w, r: st.r };
    }));
    return { maxW, best1rm, bestSet, sessions: h.length };
  }
  // PRs set on a given date (max weight or e1RM beaten vs everything before it).
  function prsOn(date) {
    const w = state.workouts[date]; if (!w) return [];
    const out = [];
    [...new Set(w.entries.filter(entryLogged).map((e) => e.exId))].forEach((exId) => {
      const h = history(exId); const before = h.filter((x) => x.date < date); if (!before.length) return;
      const prevMax = Math.max(...before.flatMap((x) => x.sets.map((st) => e1rm(st.w, st.r))));
      const today = h.find((x) => x.date === date); if (!today) return;
      const todayMax = Math.max(...today.sets.map((st) => e1rm(st.w, st.r)));
      if (todayMax > prevMax) out.push(exId);
    });
    return out;
  }
  // Progressive overload hint: if every set last time hit the target reps,
  // suggest last weight + progression increment.
  function suggestion(exId, targetReps, beforeDate) {
    const last = history(exId).find((x) => x.date < beforeDate); if (!last) return null;
    const work = last.sets.filter((st) => st.t !== 'w');
    if (!work.length) return null;
    const topW = Math.max(...work.map((st) => st.w));
    const tr = Number(targetReps) || 0;
    const hitAll = tr > 0 && work.every((st) => st.r >= tr);
    return hitAll ? { w: +(topW + Number(state.settings.progression)).toFixed(2), reason: `Hit ${tr}+ reps on every set last time` } : null;
  }
  // How often this exercise was swapped for each alternative (most used first).
  function swapMemory(exId) {
    const counts = {};
    Object.values(state.workouts).forEach((w) => w.entries.forEach((e) => { if (e.swappedFrom === exId) counts[e.exId] = (counts[e.exId] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  // Aggregate stats over a date range [from, to].
  function rangeStats(from, to) {
    let workouts = 0, sets = 0, reps = 0, volume = 0, exercises = 0, dur = 0, durN = 0;
    const byMuscle = {}; const comps = [];
    Object.values(state.workouts).forEach((w) => {
      if (w.date < from || w.date > to) return;
      const logged = w.entries.filter(entryLogged); if (!logged.length) return;
      workouts++; exercises += logged.length;
      if (w.durationSec) { dur += w.durationSec; durN++; }
      logged.forEach((e) => { const ds = doneSets(e); sets += ds.length; reps += ds.reduce((a, st) => a + Number(st.r), 0); volume += volumeOf(ds); const m = state.exercises[e.exId]?.muscle || 'Other'; byMuscle[m] = (byMuscle[m] || 0) + ds.length; });
    });
    for (let d = from; d <= to; d = addDays(d, 1)) { const c = completion(d); if (c !== null) comps.push(c); }
    return { workouts, sets, reps, volume, exercises, avgDur: durN ? dur / durN : 0, byMuscle, completion: comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : 0, plannedDays: comps.length };
  }

  // ---------- exports ----------
  GT.store = {
    DAYS, uid, clone, dateKey, parseKey, addDays, weekday, todayKey, canon, guessMuscle,
    get s() { return state; },
    load, save, flushNow, importAny, importV1,
    onChange: (fn) => listeners.add(fn),
    ensureExercise: (name, muscle) => ensureExercise(state, name, muscle),
    ex: (id) => state.exercises[id] || { id, name: 'Unknown exercise', muscle: 'Other' },
    plannedFor, dayLabel, musclesFor, ensureWorkout, newEntry, switchWorkout, syncPlanToOpenWorkouts,
    setValid, entryLogged, entryComplete, doneSets, volumeOf,
    hasWorkout, isRestDay, completion, plannedDoneCount, dayStatus,
    currentStreak, longestStreak, history, e1rm, prFor, prsOn, suggestion, swapMemory, rangeStats,
    exportJSON: () => JSON.stringify(state, null, 1),
    reset: () => { state = blankState(); seedDefaults(state); flushNow(); listeners.forEach((fn) => fn()); },
    freezePastDays
  };
})();
