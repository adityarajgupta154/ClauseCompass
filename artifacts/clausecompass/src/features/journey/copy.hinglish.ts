import type { Copy } from "./copy.en";
import { product } from "./copy/hinglish/product";
import { boundary } from "./copy/hinglish/boundary";
import { welcome } from "./copy/hinglish/welcome";
import { stages } from "./copy/hinglish/stages";
import { display } from "./copy/hinglish/display";
import { readAloud } from "./copy/hinglish/readAloud";
import { upload } from "./copy/hinglish/upload";
import { interview } from "./copy/hinglish/interview";
import { safety } from "./copy/hinglish/safety";
import { analysis } from "./copy/hinglish/analysis";
import { session } from "./copy/hinglish/session";
import { map } from "./copy/hinglish/map";
import { timeline } from "./copy/hinglish/timeline";
import { review } from "./copy/hinglish/review";
import { ask } from "./copy/hinglish/ask";
import { compare } from "./copy/hinglish/compare";
import { packet } from "./copy/hinglish/packet";
import { resources } from "./copy/hinglish/resources";
import { sourceCard } from "./copy/hinglish/sourceCard";
import { footer } from "./copy/hinglish/footer";
import { auth } from "./copy/hinglish/auth";
import { notFoundPage } from "./copy/hinglish/notFoundPage";
import { loadingScreen, skipToContent } from "./copy/hinglish/common";

/**
 * The Hinglish copy (FR-11): Hindi in Roman script, with the English words a
 * reader in India uses for these things (document, clause, notice, deposit,
 * legal aid) kept as they are. Same shape as the English table, enforced by
 * the `Copy` type; the meaning of every sentence follows its English line,
 * and the safety copy (the boundary, the retention notice, the safety
 * screen) makes exactly the same commitments in the same order.
 *
 * Three things are not translated, on purpose: the document's own wording
 * and the statements prepared from it (they are shown as they are, and the
 * language control says so), the preparation packet (it is prepared in
 * English so it can be handed to a lawyer or a legal-aid service as it is;
 * its sections point at the English table), and names (ClauseCompass, NALSA,
 * Tele Law, file types).
 */
const hinglishTable = {
  product,
  boundary,
  welcome,
  stages,
  display,
  readAloud,
  upload,
  interview,
  safety,
  analysis,
  session,
  map,
  timeline,
  review,
  ask,
  compare,
  packet,
  resources,
  sourceCard,
  footer,
  auth,
  notFoundPage,
  skipToContent,
  loadingScreen,
};

export const hinglish: Copy = hinglishTable;
