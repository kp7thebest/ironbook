// Verifies every ALIASES target in src/lib/registry.js is a real exercise-database name.
// Run: node .testharness/check-aliases.mjs   (exit 1 on any miss)
import { EXDB } from "../src/exdb.js";
import { ALIASES } from "../src/lib/registry.js";

const pairs = Object.entries(ALIASES);
const names = new Set(EXDB.map(([n]) => n));
const missing = pairs.filter(([, target]) => !names.has(target));

console.log(`aliases checked: ${pairs.length}`);
if (pairs.length < 60) {
  console.log("  ✗ expected 60+ aliases — is the table still exported from src/lib/registry.js?");
  process.exit(1);
}
if (missing.length) {
  missing.forEach(([k, t]) => console.log(`  ✗ "${k}" -> "${t}" not in exercise DB`));
  process.exit(1);
}
console.log("  all alias targets exist ✓");
