import { useState, useEffect } from "react";
import { MainApp } from "./MainApp.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { Shell } from "./components/Shell.jsx";
import { configured, getSession, supabase } from "./db.js";
import { CACHE_PREFIX, THEME_KEY } from "./lib/constants.js";
import { clearCrewCache } from "./lib/crewCache.js";
import { lsGet, lsSet } from "./lib/storage.js";
import { isReloadBlocked } from "./lib/updates.js";
import { AuthScreen } from "./views/Auth.jsx";
import { ResetPasswordScreen } from "./views/ResetPassword.jsx";

// ============ APP ============
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [theme, setTheme] = useState(() => (lsGet(THEME_KEY, "dark") === "light" ? "light" : "dark"));
  const [recovering, setRecovering] = useState(false); // arrived via password-reset link
  const toggleTheme = () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; lsSet(THEME_KEY, n); return n; });

  useEffect(() => {
    if (!configured) return;
    getSession().then(setSession);
    // onAuthChange fires "PASSWORD_RECOVERY" when the reset link is opened.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") clearSignedOutData();
      setSession(s);
    });
    // Fallback: the reset redirect adds ?reset=1
    if (new URLSearchParams(window.location.search).get("reset") === "1") setRecovering(true);
    return () => data.subscription.unsubscribe();
  }, []);

  const updateReady = useAppUpdate();
  const [updateHidden, setUpdateHidden] = useState(false);
  // Rendered outside Shell (so it shows on every screen); styled by .wt-update in styles.css.
  const banner = updateReady && !updateHidden && (
    <div className="wt-update" role="status">
      <span className="wt-update-msg">New version ready</span>
      <button className="wt-update-btn" onClick={() => window.location.reload()}>Refresh</button>
      <button className="wt-update-later" onClick={() => setUpdateHidden(true)} aria-label="Hide for now; the app updates the next time you open it">Later</button>
    </div>
  );

  return <>{banner}{renderScreen()}</>;

  function renderScreen() {
  if (!configured) return (
    <Shell theme={theme}>
      <div className="wt-confirm-wrap">
        <div className="wt-eyebrow">Setup needed</div>
        <h2 className="wt-confirm-title">Supabase isn’t configured</h2>
        <p className="wt-confirm-body">Copy <strong>.env.example</strong> to <strong>.env</strong>, fill in your Supabase URL and anon key, then restart. See SETUP.md.</p>
      </div>
    </Shell>
  );
  if (session === undefined) return <LoadingScreen theme={theme} label="Opening Ironbook" />;
  if (recovering && session) return <ResetPasswordScreen theme={theme} onDone={() => {
    setRecovering(false);
    // clean the ?reset=1 out of the URL
    window.history.replaceState({}, "", window.location.origin + "/");
  }} />;
  if (!session) return <AuthScreen theme={theme} onToggleTheme={toggleTheme} />;
  return <MainApp key={session.user.id} session={session} theme={theme} onToggleTheme={toggleTheme} />;
  }
}

// Signing out removes the copies of logs kept on this phone for instant launch and the crew cache.
// (Drafts and unsynced changes stay: they're sent the next time that person signs in.)
function clearSignedOutData() {
  clearCrewCache();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}

// ============ APP UPDATES ============
// sw.js activates a new version as soon as it downloads (skipWaiting + clients.claim), but the open
// page keeps running the old code. That's why updates used to need two relaunches. Now:
//  - every time the app comes to the foreground we ask the browser to check for a new sw.js;
//  - when a new version takes over, a banner offers Refresh;
//  - if the app is then backgrounded and reopened, it refreshes by itself — unless a past session
//    is open for editing. (An in-progress workout is saved on the phone, so it survives a refresh.)
export function useAppUpdate() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let hadController = Boolean(sw.controller); // false on first install: nothing to announce then
    let isReady = false;
    const onControllerChange = () => {
      if (!hadController) { hadController = true; return; }
      isReady = true; setReady(true);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (isReady && !isReloadBlocked()) { window.location.reload(); return; }
      sw.getRegistration().then((r) => r && r.update()).catch(() => {});
    };
    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return ready;
}
