import type { SourceLocation } from "@workspace/grounding";
import { copy, type Copy } from "@/features/journey/copy";

/** "Clause 7.1 · Page 3, paragraph 27", "Page 3, paragraph 27", "Paragraph 27": in the reader's language unless a table is given (the packet passes the English one). */
export function formatLocation(location: SourceLocation, words: Copy["sourceCard"]["location"] = copy.sourceCard.location): string {
  const place =
    location.page === null
      ? words.paragraphOnly(location.paragraph)
      : `${words.page(location.page)}, ${words.paragraph(location.paragraph)}`;
  return location.clause ? `${words.clause(location.clause)}${words.separator}${place}` : place;
}
