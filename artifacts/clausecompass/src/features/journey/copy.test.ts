import { describe, expect, it } from "vitest";
import { setDisplay } from "@/features/display/display-store";
import { copy, en, hinglish, tables } from "./copy";

/**
 * The two language tables must say the same things (Task 7.2, FR-11): the
 * type pins the shape, and this pins what the type cannot: no empty line, no
 * English line left in the Hinglish table by mistake outside the parts that
 * are English on purpose, and phrase functions that produce text for the
 * arguments the screens pass. `copy` itself follows the display setting.
 */

type Leaf = { path: string; value: unknown };

function leaves(value: unknown, path = ""): Leaf[] {
  if (typeof value === "function" || typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${path}[${index}]`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, path ? `${path}.${key}` : key));
  }
  throw new Error(`unexpected leaf at ${path}: ${String(value)}`);
}

/**
 * Lines that are the same in both tables by design: the packet is prepared
 * in English; names, file names and formats are not words; and some English
 * words are the words a Hinglish reader uses (Continue, Deposit, Clause 4).
 */
const ENGLISH_ON_PURPOSE = [
  /^packet\.(document|sections|closing)/,
  /^packet\.actions\.fileName$/,
  /^product\.name$/,
  /\.locale$/,
  /^display\.language\.(english|hinglish)$/,
  /^display\.textSize\.percent$/,
  // Settings vocabulary a Hinglish reader uses as it is: the menu's name and the two named themes.
  /^display\.label$/,
  /^display\.theme\.(label|light|dark)$/,
  /^sourceCard\.location\.(separator|clause|page|paragraph|paragraphOnly)$/,
  /^compare\.(summary\.byKind|card\.terms)$/,
  /^compare\.kinds\.wording\.label$/,
  /^upload\.continue$/,
  /^map\.topics\.(parties|renewal|deadline|payment|deposit|non-compete|non-solicit|notice|termination)$/,
  // Loanwords the Hinglish copy uses as they are, drawn on the pictures of the choice and of the upload.
  /^welcome\.stageArt\.(contract|notice)$/,
  /^welcome\.stageAside\.words\[0\]$/,
  /^upload\.art\.label$/,
  // The compass rose's cardinal letters are the same in both.
  /^footer\.compassPoints\[[0-3]\]$/,
  // Sign-in vocabulary a Hinglish reader uses as it is: the field names and the two header controls.
  /^auth\.signIn\.(email|password)$/,
  /^auth\.header\.(signIn|signOut)$/,
];

const SAMPLE_ARGS: unknown[][] = [
  [1],
  [3],
  ["sample"],
  ["sample", "other"],
  ["kind", 4, 2],
  ["kind", 4, null],
  [["a.pdf", "b.pdf"]],
  [3, "label"],
  ["side", ["x", "y"]],
  [["Money", "Time"]],
];

function phrase(fn: (...args: unknown[]) => unknown): string {
  for (const args of SAMPLE_ARGS) {
    try {
      const out = fn(...args);
      if (typeof out === "string") return out;
      if (Array.isArray(out)) return out.join(" ");
    } catch {
      // a signature this sample does not fit; try the next
    }
  }
  throw new Error("no sample argument list fits this phrase function");
}

describe("copy tables", () => {
  const english = leaves(en);
  const hindi = new Map(leaves(hinglish).map((leaf) => [leaf.path, leaf.value]));

  it("have the same leaves", () => {
    expect([...hindi.keys()].sort()).toEqual(english.map((leaf) => leaf.path).sort());
  });

  it("have no empty line and no phrase function that comes back empty", () => {
    for (const table of Object.values(tables)) {
      for (const { path, value } of leaves(table)) {
        if (typeof value === "string") expect(value.trim(), path).not.toBe("");
        else expect(phrase(value as (...args: unknown[]) => unknown).trim(), path).not.toBe("");
      }
    }
  });

  it("differ in every line that is not English on purpose", () => {
    const same: string[] = [];
    for (const { path, value } of english) {
      if (ENGLISH_ON_PURPOSE.some((pattern) => pattern.test(path))) continue;
      const other = hindi.get(path);
      const a = typeof value === "string" ? value : phrase(value as (...args: unknown[]) => unknown);
      const b = typeof other === "string" ? other : phrase(other as (...args: unknown[]) => unknown);
      if (a === b) same.push(path);
    }
    expect(same).toEqual([]);
  });

  it("keep the safety commitments in the same order: the boundary has the same number of points, the retention notice the same", () => {
    expect(hinglish.boundary.points).toHaveLength(en.boundary.points.length);
    expect(hinglish.upload.notice.points(30)).toHaveLength(en.upload.notice.points(30).length);
    expect(hinglish.upload.notice.points(null)).toHaveLength(en.upload.notice.points(null).length);
    // The retention window is stated in both, with the number the server gave.
    expect(hinglish.upload.notice.points(30).join(" ")).toContain("30 minute");
    expect(hinglish.session.note(30)).toContain("30 minute");
  });

  it("copy follows the display setting and reads the table at access time", () => {
    try {
      setDisplay({ locale: "hinglish" });
      expect(copy.upload.heading).toBe(hinglish.upload.heading);
      expect(copy.review.withheld(2)).toBe(hinglish.review.withheld(2));
      setDisplay({ locale: "en" });
      expect(copy.upload.heading).toBe(en.upload.heading);
    } finally {
      setDisplay({ locale: "en" });
    }
  });
});
