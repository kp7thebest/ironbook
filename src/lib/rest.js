import { norm } from "./helpers.js";
import { lsGet, lsSet } from "./storage.js";

// ============ REST TIMER (v13, N1) ============
// The running timer is { endsAt (ms), total (s), exercise } in localStorage, so it survives tab
// switches, a refresh or the phone locking. Rest length is remembered per exercise.
export const REST_KEY = "ironbook:rest";
export const REST_SECS_KEY = "ironbook:restsec";
export const REST_ON_KEY = "ironbook:resttimer";
export const DEFAULT_REST = 90;
export const MIN_REST = 15, MAX_REST = 600;
export const clampRest = (s) => Math.max(MIN_REST, Math.min(MAX_REST, Math.round(s)));

export const restSecondsFor = (exercise) => {
  const v = lsGet(REST_SECS_KEY, {})[norm(exercise || "")];
  return Number.isFinite(v) ? clampRest(v) : DEFAULT_REST;
};
export const rememberRest = (exercise, secs) => {
  const m = lsGet(REST_SECS_KEY, {});
  m[norm(exercise || "")] = clampRest(secs);
  lsSet(REST_SECS_KEY, m);
};
export const restEnabled = () => lsGet(REST_ON_KEY, true) !== false;

// 1:05 / 0:09
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---- end-of-rest signal: vibration (Android) + a short two-note tone (needs a tap first on iOS) ----
let audio = null;
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === "suspended") audio.resume();
  } catch { /* no audio */ }
}
export function chime() {
  try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch { /* not supported */ }
  try {
    if (!audio || audio.state !== "running") return;
    const t = audio.currentTime;
    [[880, 0], [1175, 0.18]].forEach(([f, dt]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.25, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
      o.connect(g).connect(audio.destination);
      o.start(t + dt); o.stop(t + dt + 0.18);
    });
  } catch { /* no audio */ }
}
