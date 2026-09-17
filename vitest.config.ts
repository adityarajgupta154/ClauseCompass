import path from "node:path";
import { defineConfig } from "vitest/config";
import { LAYERS, projectGlobs } from "./scripts/test/layers";

/**
 * One `pnpm test` for the whole workspace (PRD §11, §12). Unit tests sit
 * beside the code they cover; cross-package suites (golden documents,
 * adversarial cases, accessibility, export) live under `tests/`. Fixtures
 * that are binary (PDF, DOCX) are generated at test time from the text
 * samples, never committed.
 *
 * The suites run as one vitest project per PRD §12 layer (`scripts/test/
 * layers.ts`), so every file is reported under its layer and the run ends
 * with a per-layer table (`scripts/test/layer-summary.ts`).
 */
export default defineConfig({
  resolve: {
    // The web app's "@/" and "@samples/" aliases (vite.config.ts), so its pure helpers can be tested here without a DOM.
    alias: {
      "@": path.resolve(import.meta.dirname, "artifacts/clausecompass/src"),
      "@samples": path.resolve(import.meta.dirname, "samples"),
    },
  },
  // The web app's JSX runtime (its Vite config gets it from the React plugin), so a pure component can be rendered to markup in a test.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // The web app's sign-in behind its offline stand-in (features/auth/auth-mock.ts), read through import.meta.env like the Vite build does.
    env: { VITE_AUTH_PROVIDER: "mock" },
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default", "./scripts/test/layer-summary.ts"],
    // `pnpm test:coverage`: statement/branch coverage of the product code (both services and the libraries),
    // never of the tests, the test-only helpers or the offline stand-ins. No threshold is enforced here; the
    // report is evidence for the reader of tests/README.md, and the layer table above is the gate.
    coverage: {
      provider: "v8",
      include: ["artifacts/api-server/src/**", "artifacts/clausecompass/src/**", "lib/*/src/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "artifacts/api-server/src/testing/**",
        "artifacts/api-server/src/llm/mock.ts",
        "artifacts/api-server/src/auth/mock.ts",
        "artifacts/clausecompass/src/features/auth/auth-mock.ts",
        "artifacts/clausecompass/src/pages/dev/**",
      ],
      reporter: ["text-summary", "html"],
      reportsDirectory: "./coverage",
    },
    projects: LAYERS.map((layer) => ({
      extends: true,
      test: { name: layer.name, ...projectGlobs(layer) },
    })),
  },
});
