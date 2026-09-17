import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { LAYERS, layerOf, projectGlobs, TEST_ROOTS } from "../../scripts/test/layers";

/**
 * `pnpm test` runs one vitest project per PRD section 12 layer, each with
 * its own include globs. A test file that matched no project would never
 * run and nothing would say so, so this checks that every test file on disk
 * resolves to a layer, that the layer table is well formed, and that the
 * globs vitest is given follow from the same table.
 */

const root = join(import.meta.dirname, "..", "..");

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist"]);

function walk(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name), files);
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      files.push(relative(root, join(directory, entry.name)).split("\\").join("/"));
    }
  }
}

function testFilesOnDisk(): string[] {
  const files: string[] = [];
  for (const testRoot of TEST_ROOTS) walk(join(root, testRoot), files);
  return files.sort();
}

describe("test layers", () => {
  it("assigns every test file on disk to exactly one layer", () => {
    const files = testFilesOnDisk();
    expect(files.length).toBeGreaterThan(50);
    const unassigned = files.filter((file) => layerOf(file) === null);
    expect(unassigned).toEqual([]);
    // Every layer has at least one file; an empty layer means a directory moved without the table.
    const counts = Object.fromEntries(LAYERS.map((layer) => [layer.name, files.filter((file) => layerOf(file)?.name === layer.name).length]));
    for (const layer of LAYERS) expect(counts[layer.name], `${layer.name} has test files`).toBeGreaterThan(0);
  });

  it("puts each PRD §12 suite where the PRD describes it", () => {
    const layer = (file: string) => layerOf(file)?.name;
    expect(layer("tests/golden/pipeline.test.ts")).toBe("golden");
    expect(layer("tests/adversarial/prompt-injection.test.ts")).toBe("adversarial");
    expect(layer("tests/safety/escalation-fixtures.test.ts")).toBe("adversarial");
    expect(layer("lib/rules/src/untrusted.test.ts")).toBe("adversarial");
    expect(layer("tests/a11y/route-focus.test.tsx")).toBe("accessibility");
    expect(layer("lib/grounding/src/validate.test.ts")).toBe("schema");
    expect(layer("artifacts/api-server/src/llm/claims.test.ts")).toBe("schema");
    expect(layer("artifacts/api-server/src/extraction/extract.test.ts")).toBe("integration");
    expect(layer("artifacts/api-server/src/routes/sessions.test.ts")).toBe("integration");
    expect(layer("tests/export/packet-export.test.ts")).toBe("integration");
    expect(layer("lib/rules/src/engine.test.ts")).toBe("unit");
    expect(layer("artifacts/clausecompass/src/features/packet/build-packet.test.ts")).toBe("unit");
    expect(layer("tests/support/layers.test.ts")).toBe("unit");
    // Not test files, or outside the roots: no layer.
    expect(layer("lib/rules/src/engine.ts")).toBeUndefined();
    expect(layer("scripts/test/layers.ts")).toBeUndefined();
    expect(layer("artifacts/api-server/node_modules/x/y.test.ts")).toBeUndefined();
  });

  it("is a well-formed table: unique names, the catch-all last, paths that exist, no path claimed twice", () => {
    expect(new Set(LAYERS.map((layer) => layer.name)).size).toBe(LAYERS.length);
    expect(LAYERS.filter((layer) => layer.paths.length === 0).map((layer) => layer.name)).toEqual(["unit"]);
    expect(LAYERS[LAYERS.length - 1]!.name).toBe("unit");
    const files = testFilesOnDisk();
    const claimed = new Set<string>();
    for (const layer of LAYERS) {
      for (const path of layer.paths) {
        expect(claimed.has(path), `${path} listed once`).toBe(false);
        claimed.add(path);
        const covered = path.endsWith("/") ? files.filter((file) => file.startsWith(path)) : files.filter((file) => file === path);
        expect(covered.length, `${path} (layer ${layer.name}) covers at least one test file`).toBeGreaterThan(0);
      }
    }
  });

  it("derives each project's globs from the table, with earlier layers excluded from later ones", () => {
    const golden = projectGlobs(LAYERS[0]!);
    expect(golden.include).toEqual(["tests/golden/**/*.test.{ts,tsx}"]);
    expect(golden.exclude).toEqual(["**/node_modules/**", "**/dist/**"]);
    const unit = projectGlobs(LAYERS[LAYERS.length - 1]!);
    expect(unit.include).toEqual(["artifacts/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"]);
    expect(unit.exclude).toContain("tests/golden/**/*.test.{ts,tsx}");
    expect(unit.exclude).toContain("lib/rules/src/untrusted.test.ts");
    expect(unit.exclude).toContain("artifacts/api-server/src/llm/**/*.test.{ts,tsx}");
    expect(unit.exclude).toHaveLength(2 + LAYERS.slice(0, -1).reduce((sum, layer) => sum + layer.paths.length, 0));
  });
});
