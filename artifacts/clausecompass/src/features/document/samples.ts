import { z } from "zod";
import manifest from "@samples/manifest.json";

/**
 * Synthetic fixtures from the repo's samples/ directory, offered on the upload
 * screen so the flow can be tried without a document at hand. The text is
 * loaded lazily and turned into a File, so it goes through exactly the same
 * validation and state as a file the person picked themselves.
 */
const sampleSchema = z.object({
  id: z.string().min(1),
  file: z.string().regex(/\.txt$/),
  title: z.string().min(1),
  documentType: z.enum(["offer_letter", "rental", "nda"]),
  suggestedStage: z.enum(["before-signing", "problem-started", "compare-versions"]),
  description: z.string().min(1),
});

export type Sample = z.infer<typeof sampleSchema>;

export const SAMPLES: readonly Sample[] = z
  .array(sampleSchema)
  .parse(manifest.samples);

// Vite resolves the glob at build time; each entry is a lazy loader for the raw text.
const loaders = import.meta.glob("@samples/*.txt", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export async function loadSampleFile(sample: Sample): Promise<File> {
  const key = Object.keys(loaders).find((path) => path.endsWith(`/${sample.file}`));
  if (!key) throw new Error(`Sample text not bundled: ${sample.file}`);
  const text = await loaders[key]();
  return new File([text], sample.file, { type: "text/plain" });
}
