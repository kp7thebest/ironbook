import { useSyncExternalStore } from "react";
import { lsGet, lsSet } from "./storage.js";

// ============ COLOUR SCHEMES (v14) ============
// Per phone (like light/dark). Violet is the original; the others are generated and contrast-checked by
// .testharness/schemes.py, which writes their CSS into styles.css.
export const SCHEMES = [
  { id: "violet", name: "Violet", sub: "the original" },
  { id: "rust", name: "Rust", sub: "rust on bare steel" },
  { id: "turf", name: "Turf", sub: "sled-track green, line-paint yellow" },
  { id: "pool", name: "Pool", sub: "deep end, lane-rope red" },
  { id: "oxblood", name: "Oxblood", sub: "old leather, brass" },
  { id: "neon", name: "Neon", sub: "the gym sign at 2 a.m." },
  { id: "chalk", name: "Chalk", sub: "chalk on black iron" },
];
export const SCHEME_KEY = "ironbook:scheme";
const valid = (id) => (SCHEMES.some((s) => s.id === id) ? id : "violet");
let current = valid(lsGet(SCHEME_KEY, "violet"));
const subs = new Set();
export const getScheme = () => current;
export function setScheme(id) {
  current = valid(id);
  lsSet(SCHEME_KEY, current);
  subs.forEach((f) => f());
}
const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };
export const useScheme = () => useSyncExternalStore(subscribe, getScheme, getScheme);
// class for .wt-root (violet = the base tokens, no extra class)
export const schemeClass = (id) => (id && id !== "violet" ? ` scheme-${id}` : "");
