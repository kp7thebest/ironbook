import { useState } from "react";
import { Shell } from "../components/Shell.jsx";
import { updatePassword } from "../db.js";

// ============ RESET PASSWORD (after clicking the email link) ============
export function ResetPasswordScreen({ theme, onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw !== confirm) { setErr("Passwords don’t match."); return; }
    setBusy(true);
    try { await updatePassword(pw); onDone(); }
    catch (e) { setErr(e.message || "Couldn’t set password. The reset link may have expired — request a new one."); }
    finally { setBusy(false); }
  };
  return (
    <Shell theme={theme}>
      <div className="wt-profile-wrap">
        <div className="wt-eyebrow">Reset password</div>
        <h1 className="wt-title">IRONBOOK</h1>
        <p className="wt-profile-sub">Set a new password</p>
        <div className="wt-form auth">
          <label>New password<input type="password" value={pw} autoFocus autoComplete="new-password" onChange={(e) => { setPw(e.target.value); setErr(""); }} /></label>
          <label>Confirm new password<input type="password" value={confirm} autoComplete="new-password" onChange={(e) => { setConfirm(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          {err && <div className="wt-err">{err}</div>}
          <button className="wt-primary" disabled={busy || !pw || !confirm} onClick={submit}>{busy ? "Saving…" : "Set password & sign in"}</button>
        </div>
      </div>
    </Shell>
  );
}
