import { useState } from "react";
import { fetchProfiles, fetchWorkouts } from "../db.js";
import { useCached } from "../lib/crewCache.js";
import { HistoryView } from "./History.jsx";

// ============ FRIENDS ============
// Crew list and each friend's log come from the crew cache: shown at once on a revisit, refreshed behind.
export function FriendsView({ myId, unit }) {
  const [sel, setSel] = useState(null); // selected friend profile
  const crew = useCached("profiles", fetchProfiles);
  const log = useCached(sel ? "workouts:" + sel.id : null, () => fetchWorkouts(sel.id));
  const profiles = crew.data ? crew.data.filter((p) => p.id !== myId) : null;
  const friendWorkouts = log.data;

  if (crew.error) return <div className="wt-pane"><p className="wt-hint">Couldn’t load the crew.</p></div>;
  if (!profiles) return <div className="wt-pane"><p className="wt-hint">Loading the crew…</p></div>;
  if (profiles.length === 0) return <div className="wt-pane"><p className="wt-hint">No one else has joined yet. Send your friends the app link and the invite code — once they sign up, their logs show here.</p></div>;

  if (sel) {
    return (
      <div className="wt-pane">
        <button className="wt-ghost back" onClick={() => setSel(null)}>← All friends</button>
        <div className="wt-friend-head">
          <span className="wt-avatar big">{sel.display_name[0].toUpperCase()}</span>
          <div>
            <div className="wt-friend-name">{sel.display_name}</div>
            <div className="wt-hint">{log.error ? "Couldn’t load their log." : friendWorkouts ? `${friendWorkouts.length} sessions · read-only` : "Loading…"}</div>
          </div>
        </div>
        {friendWorkouts && <HistoryView unit={unit} workouts={friendWorkouts} who={sel.display_name} readOnly />}
      </div>
    );
  }

  return (
    <div className="wt-pane">
      <div className="wt-count">The crew</div>
      {profiles.map((p) => (
        <button key={p.id} className="wt-friend-row" onClick={() => setSel(p)}>
          <span className="wt-avatar">{p.display_name[0].toUpperCase()}</span>
          <span className="wt-friend-name">{p.display_name}</span>
          <span className="wt-hint">View log <span aria-hidden="true">›</span></span>
        </button>
      ))}
    </div>
  );
}
