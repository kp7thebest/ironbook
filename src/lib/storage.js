// localStorage JSON helpers (fine outside Claude artifacts)
export const lsGet = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full/blocked */ } };
export const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
