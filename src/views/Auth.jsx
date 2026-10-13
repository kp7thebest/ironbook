import { useState } from "react";
import { Shell } from "../components/Shell.jsx";
import { sendPasswordReset, signIn, signUp } from "../db.js";

// ============ AUTH SCREEN ============
export function AuthScreen({ theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Pick a display name (2+ characters).");
        if (!invite.trim()) throw new Error("Enter the invite code from the crew.");
        if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
        try {
          await signUp(email.trim(), pw, name.trim(), invite.trim());
        } catch (e) {
          // The invite check runs in the database (patch_invite_code.sql); a wrong code surfaces as this.
          if (/database error saving new user/i.test(e.message || "")) {
            throw new Error("That invite code didn’t work. Ask the crew for the current code.");
          }
          throw e;
        }
      } else if (mode === "forgot") {
        if (!email.trim()) throw new Error("Enter your email first.");
        await sendPasswordReset(email.trim());
        setNotice("Check your email for a reset link. It may take a minute, and could land in spam.");
      } else {
        await signIn(email.trim(), pw);
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally { setBusy(false); }
  };

  const goto = (m) => { setMode(m); setErr(""); setNotice(""); };

  const subtitle = mode === "signin" ? "Welcome back" : mode === "signup" ? "Join the crew" : "Reset your password";
  const cta = busy ? "One sec…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <Shell theme={theme}>
      <div className="wt-profile-wrap">
        <div className="wt-eyebrow">Training log</div>
        <h1 className="wt-title">IRONBOOK</h1>
        <p className="wt-profile-sub">{subtitle}</p>
        <div className="wt-form auth">
          {mode === "signup" && (
            <label>Display name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Srijan" autoComplete="nickname" /></label>
          )}
          {mode === "signup" && (
            <label>Invite code<input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Ask the crew"
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email"
            onKeyDown={(e) => e.key === "Enter" && mode === "forgot" && submit()} /></label>
          {mode !== "forgot" && (
            <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          )}
          {err && <div className="wt-err">{err}</div>}
          {notice && <div className="wt-notice">{notice}</div>}
          <button className="wt-primary" disabled={busy || !email || (mode !== "forgot" && !pw)} onClick={submit}>{cta}</button>

          {mode === "signin" && (
            <button className="wt-ghost small" onClick={() => goto("forgot")}>Forgot password?</button>
          )}
          <button className="wt-ghost" onClick={() => goto(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup")}>
            {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "← Back to sign in"}
          </button>
        </div>
        <button className="wt-theme-inline" onClick={onToggleTheme} aria-label="Toggle dark or light mode">
          {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
        </button>
      </div>
    </Shell>
  );
}
