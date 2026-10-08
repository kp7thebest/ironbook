// Lint rules that catch crash-class mistakes before they ship.
// Run: npx eslint -c .testharness/eslint.config.js src   (or .testharness/run.sh, which does everything)
//
// The one that matters most is react-hooks/rules-of-hooks: v8 put hooks below an early `return` in
// LogView and saving a workout blanked the whole screen. That mistake now fails the harness.
// ESLint is installed on demand (see README), like Playwright, so it doesn't slow Vercel builds.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    files: ["src/**/*.{js,jsx}", ".testharness/lint-fixtures/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" }, // exhaustive-deps is off, so its disables are moot
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off", // noisy for this codebase; deliberate omissions are common
      // Core ESLint can't see JSX usage without the React plugin, so components look "unused".
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
