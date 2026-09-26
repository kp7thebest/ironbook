// Verifies every ALIASES target in src/App.jsx is a real exercise-database name.
// Run: node .testharness/check-aliases.mjs   (exit 1 on any miss)
import { readFileSync } from "fs";
import { EXDB } from "../src/exdb.js";

const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const block = src.slice(src.indexOf("const ALIASES = {"), src.indexOf("};", src.indexOf("const ALIASES = {")));
const pairs = [...block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
const names = new Set(EXDB.map(([n]) => n));
const missing = pairs.filter(([, target]) => !names.has(target));

console.log(`aliases checked: ${pairs.length}`);
if (missing.length) {
  missing.forEach(([k, t]) => console.log(`  ✗ "${k}" -> "${t}" not in exercise DB`));
  process.exit(1);
}
console.log("  all alias targets exist ✓");
