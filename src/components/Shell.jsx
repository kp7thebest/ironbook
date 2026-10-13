import { schemeClass, useScheme } from "../lib/scheme.js";

export function Shell({ theme, children }) {
  const scheme = useScheme(); // v14 colour scheme (per phone)
  return <div className={"wt-root theme-" + theme + schemeClass(scheme)}>{children}</div>;
}
