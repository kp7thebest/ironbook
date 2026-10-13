import { SCHEMES, setScheme, useScheme } from "../lib/scheme.js";

// Colour scheme picker (v14). Each swatch is drawn with that scheme's own tokens in the current
// light/dark mode: background, a card, the accent (as the selected-tab pill) and the two chart colours.
export function SchemePicker({ theme, onPicked }) {
  const scheme = useScheme();
  return (
    <div className="wt-schemes" role="radiogroup" aria-label="Colour scheme">
      {SCHEMES.map((s) => (
        <button key={s.id} role="radio" aria-checked={scheme === s.id} className={"wt-scheme" + (scheme === s.id ? " on" : "")}
          onClick={() => { setScheme(s.id); onPicked && onPicked(s); }}>
          <span className={`wt-swatch theme-${theme} scheme-${s.id}`} aria-hidden="true">
            <span className="wt-swatch-card">
              <span className="wt-swatch-pill" />
              <span className="wt-swatch-line" />
              <span className="wt-swatch-chart"><i className="w" /><i className="r" /></span>
            </span>
          </span>
          <span className="wt-scheme-name">{s.name}</span>
          <span className="wt-scheme-sub">{s.sub}</span>
        </button>
      ))}
    </div>
  );
}
