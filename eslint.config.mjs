import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * One `pnpm lint` for the whole workspace, run by `pnpm preflight` and CI
 * after the strict type check. The type checker already owns types, unused
 * locals and import validity (every package compiles with `strict` plus
 * `noUnusedLocals`), so this configuration is for what tsc cannot see:
 * the core JavaScript pitfalls, the rules of React hooks, and static
 * accessibility of the JSX (the same axe rules `pnpm a11y` checks at
 * runtime, caught at edit time instead).
 *
 * Generated code (`lib/*\/src/generated`, from the OpenAPI document) and
 * build output are not linted; fix the generator, not its output.
 *
 * ESLint 10 with eslint-plugin-jsx-a11y 6.10, whose declared peer range still
 * ends at 9: the plugin uses no API that changed in 10 and runs clean here, and
 * ESLint 9 is deprecated on npm, so the peer range is allowed in the root
 * package.json (`pnpm.peerDependencyRules`) rather than pinning the old core.
 */
export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "coverage/**",
    "lib/*/src/generated/**",
    "**/*.d.ts",
    "attached_assets/**",
    "samples/real/**",
    ".local/**",
    ".agents/**",
    "tmp/**",
  ]),

  // Every source file: core rules, then the TypeScript rule set (which also turns off the core rules tsc makes redundant).
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      // tsc reports unused locals and parameters already; here the only addition is the `_` convention for deliberately unused ones.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // `any` is allowed only where a comment says why; the rule is an error so that "why" gets written.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "max-lines": ["error", { max: 450, skipBlankLines: true, skipComments: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
    },
  },

  // The web app and the browser-side tests: React hooks and static accessibility on top.
  {
    files: ["artifacts/clausecompass/**/*.{ts,tsx}", "tests/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.strict],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2024 },
    },
    settings: {
      // Components that render a native element under another name, so the accessibility rules check them as that element.
      "jsx-a11y": {
        components: { Link: "a" },
      },
    },
    rules: {
      // Card-style labels wrap the control and its text a few elements deep; the default depth of 2 misses the text and reports a label with none.
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either", depth: 6 }],
      // A drop target is a pointer-only shortcut around a native file input, which stays the control; drag events do not create a keyboard interaction that needs a role or a parallel key handler.
      "jsx-a11y/no-static-element-interactions": [
        "error",
        { handlers: ["onClick", "onMouseDown", "onMouseUp", "onKeyPress", "onKeyDown", "onKeyUp", "onFocus", "onBlur"] },
      ],
    },
  },

  // The web app's product code must not write to the console; the two exceptions are for failures the reader cannot act on (sign-out, error boundary).
  {
    files: ["artifacts/clausecompass/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // Config and script files run under Node directly and may read the process environment however they like.
  {
    files: ["scripts/**/*.{mjs,ts}", "**/*.config.{ts,mjs}", "**/vite/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // The accessibility runner, the social-image script and the screenshot script drive a real Chromium: the functions they pass to `page.evaluate` run in the page.
  {
    files: ["scripts/a11y/**/*.mjs", "scripts/og-image.mjs", "scripts/docs/screenshots.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2024 },
    },
  },
]);
