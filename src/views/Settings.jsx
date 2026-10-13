import { useState } from "react";
import { signOut, updatePassword } from "../db.js";
import { DEFAULT_REST, REST_ON_KEY, restEnabled } from "../lib/rest.js";
import { lsSet } from "../lib/storage.js";
import { SchemePicker } from "../components/SchemePicker.jsx";

// ============ SETTINGS ============
export function SettingsView({ flash, profile, email, onSaveProfile, onTogglePrivacy, theme }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [restOn, setRestOn] = useState(restEnabled);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Profile edit state
  const [name, setName] = useState(profile.display_name);
  const [newEmail, setNewEmail] = useState(email || "");
  const [pErr, setPErr] = useState("");
  const [pBusy, setPBusy] = useState(false);

  const nameChanged = name.trim() && name.trim() !== profile.display_name;
  const emailChanged = newEmail.trim() && newEmail.trim() !== (email || "");

  const saveProfile = async () => {
    setPErr("");
    if (name.trim().length < 2) { setPErr("Display name must be at least 2 characters."); return; }
    setPBusy(true);
    try {
      await onSaveProfile({ displayName: nameChanged ? name.trim() : null, email: emailChanged ? newEmail.trim() : null });
      flash(emailChanged ? "Saved — check your email to confirm the new address" : "Profile updated");
    } catch (e) { setPErr(e.message || "Couldn’t save changes."); }
    finally { setPBusy(false); }
  };

  const submit = async () => {
    setErr("");
    if (next.length < 6) { setErr("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setErr("New passwords don’t match."); return; }
    setBusy(true);
    try {
      await updatePassword(next);
      setNext(""); setConfirm("");
      flash("Password updated");
    } catch (e) { setErr(e.message || "Couldn’t update password."); }
    finally { setBusy(false); }
  };

  return (
    <div className="wt-pane">
      <div className="wt-settings-block">
        <div className="wt-settings-title">Profile</div>
        <div className="wt-form">
          <label>Display name<input value={name} onChange={(e) => { setName(e.target.value); setPErr(""); }} autoComplete="nickname" /></label>
          <label>Email<input type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setPErr(""); }} autoComplete="email" inputMode="email" /></label>
          {emailChanged && <p className="wt-hint">Changing your email sends a confirmation link to the new address; it takes effect once you click it.</p>}
          {pErr && <div className="wt-err">{pErr}</div>}
          <div className="wt-form-actions">
            <button className="wt-primary" disabled={(!nameChanged && !emailChanged) || pBusy} onClick={saveProfile}>{pBusy ? "Saving…" : "Save profile"}</button>
          </div>
        </div>
      </div>

      <div className="wt-settings-block">
        <div className="wt-settings-title">Colour</div>
        <SchemePicker theme={theme} onPicked={(s) => flash(`${s.name} colours`)} />
        <p className="wt-hint wt-schemes-note">Applies to this phone. Switch light and dark with the {theme === "dark" ? "☀" : "☾"} button at the top.</p>
      </div>

      <div className="wt-settings-block">
        <div className="wt-settings-title">Workout</div>
        <label className="wt-toggle-row">
          <div>
            <div className="wt-toggle-label">Rest timer</div>
            <div className="wt-hint">Starts when you enter a set’s reps. Tap +15 / −15 to change it; each exercise remembers its own rest (default {DEFAULT_REST} s). Applies to this phone.</div>
          </div>
          <button role="switch" aria-checked={restOn} aria-label="Rest timer" className={"wt-switch-toggle" + (restOn ? " on" : "")}
            onClick={() => { const v = !restOn; setRestOn(v); lsSet(REST_ON_KEY, v); flash(v ? "Rest timer on" : "Rest timer off"); }}>
            <span className="wt-switch-knob" />
          </button>
        </label>
      </div>

      <div className="wt-settings-block">
        <div className="wt-settings-title">Privacy</div>
        <label className="wt-toggle-row">
          <div>
            <div className="wt-toggle-label">Private profile</div>
            <div className="wt-hint">When on, other members can’t see your workouts or find you in Friends or Calendar.</div>
          </div>
          <button role="switch" aria-checked={!!profile.is_private} className={"wt-switch-toggle" + (profile.is_private ? " on" : "")} onClick={() => onTogglePrivacy(!profile.is_private)}>
            <span className="wt-switch-knob" />
          </button>
        </label>
      </div>

      <div className="wt-settings-block">
        <div className="wt-settings-title">Change password</div>
        <div className="wt-form">
          <label>New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setErr(""); }} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(""); }} /></label>
          {err && <div className="wt-err">{err}</div>}
          <div className="wt-form-actions">
            <button className="wt-primary" disabled={!next || !confirm || busy} onClick={submit}>{busy ? "Saving…" : "Update password"}</button>
          </div>
        </div>
      </div>

      <div className="wt-settings-block">
        <div className="wt-settings-title">Account</div>
        <button className="wt-ghost danger" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
