import { useEffect, useState } from "react";

// In-memory cache for other people's data (crew list, a friend's workouts), so switching tabs
// shows what was loaded last time at once and refreshes it in the background. Cleared on sign-out.
const mem = new Map();

export const clearCrewCache = () => mem.clear();

// useCached("profiles", fetchProfiles) -> { data, error }. A null key loads nothing.
// While a refresh fails, the cached copy stays on screen; an error is reported only when there's nothing to show.
export function useCached(key, fetcher) {
  const [state, setState] = useState(() => ({ data: key && mem.has(key) ? mem.get(key) : null, error: null }));
  useEffect(() => {
    if (!key) { setState({ data: null, error: null }); return; }
    let live = true;
    setState({ data: mem.has(key) ? mem.get(key) : null, error: null });
    fetcher()
      .then((d) => { mem.set(key, d); if (live) setState({ data: d, error: null }); })
      .catch((e) => { if (live && !mem.has(key)) setState({ data: null, error: e || new Error("failed") }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
