// "More" tab: Library and Settings, one tap away (v12 bottom navigation).
const ITEMS = [
  ["library", "Library", "Browse 870+ exercises, demos, your custom exercises, rename across your log"],
  ["settings", "Settings", "Name, email, password, privacy, sign out"],
];

export function MoreView({ onOpen }) {
  return (
    <div className="wt-pane">
      <div className="wt-count">More</div>
      {ITEMS.map(([id, label, sub]) => (
        <button key={id} className="wt-more-row" onClick={() => onOpen(id)}>
          <span className="wt-more-text">
            <span className="wt-more-label">{label}</span>
            <span className="wt-more-sub">{sub}</span>
          </span>
          <span className="wt-more-go" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}
