// Bottom navigation (v12): five tabs within thumb reach, replacing the seven-tab bar that
// overflowed on narrow phones. Crew = Friends + Calendar; More = Library + Settings.
const ICONS = {
  log: <path d="M12 5v14M5 12h14" />,
  history: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
  progress: <><path d="M4 18l5-6 4 3 7-9" /><path d="M15 6h5v5" /></>,
  crew: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.3.2 3.9 1.8 4.5 4.8" /></>,
  more: <><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></>,
};
export const NAV = [["log", "Log"], ["history", "History"], ["progress", "Progress"], ["crew", "Crew"], ["more", "More"]];

export function BottomNav({ tab, onTab }) {
  return (
    <nav className="wt-tabs" aria-label="Sections">
      <div className="wt-tabs-inner">
        {NAV.map(([id, label]) => (
          <button key={id} className={"wt-tab" + (tab === id ? " on" : "")} onClick={() => onTab(id)}
            aria-current={tab === id ? "page" : undefined}>
            <span className="wt-tab-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill={id === "more" ? "currentColor" : "none"} stroke={id === "more" ? "none" : "currentColor"}
                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[id]}</svg>
            </span>
            <span className="wt-tab-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
