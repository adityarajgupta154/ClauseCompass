/**
 * The test layers of PRD section 12, as vitest projects. Every `*.test.ts`
 * or `*.test.tsx` file under `artifacts/`, `lib/` or `tests/` belongs to
 * exactly one layer: the first entry below whose `paths` cover it, or `unit`
 * when none does. A layer's `paths` are directories (with a trailing slash)
 * or single files, relative to the repository root, and the vitest include
 * and exclude globs are derived from them, so this table is the only place
 * a file's layer is decided. `tests/support/layers.test.ts` checks that every
 * test file on disk resolves to a layer, because a file that matched no
 * project would silently never run.
 *
 * Layers that need more than a path rule: `lib/rules/src/untrusted.test.ts`
 * (instruction-like document text) is adversarial although it sits beside
 * the rules' unit tests; the model adapters under `llm/` are schema tests
 * because what they check is that model output is validated, retried and
 * refused before anything is rendered.
 */

export interface Layer {
  /** The vitest project name; each test file is reported as `|name|`. */
  name: string;
  /** Row title in the end-of-run summary. */
  title: string;
  /** What PRD section 12 says the layer must prove. */
  proves: string;
  /** Directories (trailing slash) or files, relative to the repository root. Empty for the catch-all. */
  paths: readonly string[];
}

/** Test files are `*.test.ts` and `*.test.tsx` here; the catch-all looks under these roots. */
export const TEST_ROOTS = ["artifacts/", "lib/", "tests/"] as const;
const TEST_FILE = /\.test\.tsx?$/;

export const LAYERS: readonly Layer[] = [
  {
    name: "golden",
    title: "Golden documents",
    proves: "the synthetic fixtures give the expected sources, dates, rule hits and differences",
    paths: ["tests/golden/"],
  },
  {
    name: "adversarial",
    title: "Adversarial",
    proves: "prompt injection, hostile uploads, XSS and false urgency change nothing and render nothing unsourced",
    paths: ["tests/adversarial/", "tests/safety/", "lib/rules/src/untrusted.test.ts"],
  },
  {
    name: "accessibility",
    title: "Accessibility",
    proves: "focus, display controls and read-aloud behave in a DOM (the browser walk is `pnpm a11y`)",
    paths: ["tests/a11y/"],
  },
  {
    name: "schema",
    title: "Schema",
    proves: "malformed, uncited or unknown-source model output is refused and falls back safely",
    paths: ["lib/grounding/src/model-output.test.ts", "lib/grounding/src/validate.test.ts", "artifacts/api-server/src/llm/"],
  },
  {
    name: "integration",
    title: "Integration",
    proves: "extraction, the session routes, export and error handling work end to end without leaking",
    paths: [
      "artifacts/api-server/src/extraction/",
      "artifacts/api-server/src/routes/",
      "artifacts/api-server/src/middlewares/",
      "tests/export/",
      "tests/resources/",
    ],
  },
  {
    name: "unit",
    title: "Unit",
    proves: "rule matching, dates, alignment, escalation transitions and the client's pure helpers",
    paths: [],
  },
];

const isDirectory = (path: string) => path.endsWith("/");

/** Whether a layer path covers a repository-relative file path. */
function covers(layerPath: string, file: string): boolean {
  return isDirectory(layerPath) ? file.startsWith(layerPath) : file === layerPath;
}

/** The layer a repository-relative test file belongs to, or null for a file outside the test roots or not a test file. */
export function layerOf(file: string): Layer | null {
  if (!TEST_FILE.test(file) || !TEST_ROOTS.some((root) => file.startsWith(root))) return null;
  if (file.includes("/node_modules/") || file.includes("/dist/")) return null;
  return LAYERS.find((layer) => layer.paths.some((path) => covers(path, file))) ?? LAYERS[LAYERS.length - 1]!;
}

/** The vitest include globs for a layer path. */
function globsFor(path: string): string[] {
  return isDirectory(path) ? [`${path}**/*.test.{ts,tsx}`] : [path];
}

/** `include` and `exclude` for a layer's vitest project: earlier layers are excluded from later ones, the catch-all covers the roots. */
export function projectGlobs(layer: Layer): { include: string[]; exclude: string[] } {
  const index = LAYERS.indexOf(layer);
  const earlier = LAYERS.slice(0, index).flatMap((other) => other.paths.flatMap(globsFor));
  const include = layer.paths.length > 0 ? layer.paths.flatMap(globsFor) : TEST_ROOTS.map((root) => `${root}**/*.test.{ts,tsx}`);
  return { include, exclude: ["**/node_modules/**", "**/dist/**", ...earlier] };
}
