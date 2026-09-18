/**
 * The English copy: every sentence the product says, so that none is inline
 * in a component. Components read it through `copy` (copy.ts), which follows
 * the reader's language; the Hinglish table (copy.hinglish.ts) has the same
 * shape, enforced by the `Copy` type, so a sentence cannot exist in one
 * language and be missing in the other. Add a key here first.
 *
 * The boundary statement and the retention notice are safety copy: they must
 * stay factual about what the product does and does not do. Do not soften or
 * embellish them for tone, and do not promise behaviour the code does not have.
 * Whoever changes one of them changes its Hinglish line in the same commit.
 */
export { minutesPhrase } from "./copy/en/shared";

/** One of the three points beside the sign-in form: a title and one line. */
export type SignInPoint = { title: string; line: string };

import { product } from "./copy/en/product";
import { boundary } from "./copy/en/boundary";
import { welcome } from "./copy/en/welcome";
import { stages } from "./copy/en/stages";
import { display } from "./copy/en/display";
import { readAloud } from "./copy/en/readAloud";
import { upload } from "./copy/en/upload";
import { interview } from "./copy/en/interview";
import { safety } from "./copy/en/safety";
import { analysis } from "./copy/en/analysis";
import { session } from "./copy/en/session";
import { map } from "./copy/en/map";
import { timeline } from "./copy/en/timeline";
import { review } from "./copy/en/review";
import { ask } from "./copy/en/ask";
import { compare } from "./copy/en/compare";
import { packet } from "./copy/en/packet";
import { resources } from "./copy/en/resources";
import { sourceCard } from "./copy/en/sourceCard";
import { footer } from "./copy/en/footer";
import { auth } from "./copy/en/auth";
import { notFoundPage } from "./copy/en/notFoundPage";
import { loadingScreen, skipToContent } from "./copy/en/common";

export const en = {
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

/** The shape every language table has. */
export type Copy = typeof en;
