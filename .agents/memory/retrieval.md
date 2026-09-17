---
name: Lexical retrieval decisions
description: Why the BM25 retriever excludes headings, promotes synonyms, and treats stopwords asymmetrically; what a tuning change must not break.
---
# Retrieval is data-tuned; the golden questions are the contract

- Headings are excluded from ranking, not down-weighted. **Why:** BM25 length normalisation makes a 4-word all-caps heading ("SECURITY DEPOSIT") the top hit for any section-name question, and a heading never answers. Upper-case *sentences* (ending in a full stop) stay clauses after a review caught "NO PETS ARE ALLOWED." being dropped. The heading test lives in grounding and rules re-exports it, because the dependency direction is rules → grounding.
- Synonym expansions score at 0.5, promoted to 1.0 when the reader's word occurs nowhere in the document. **Why:** "competitor" is not in the offer letter, only "competes"; at 0.5 the non-compete clause lost to clauses containing "work". When the typed word is absent, the expansion is the only way to honour it.
- Stopwords are removed from queries only (documents keep them); Hinglish and Devanagari lists exist because those are not stemmed, so inflections must be listed in stopwords and synonym keys alike.
- Expansion targets that are everywhere in a contract (licence, agreement) have no discriminating power; expansions containing "non" matched "non-public"/"non-refundable" in every document, so "non" is a stopword. Apostrophes are removed rather than split, so "don't" hits the `dont` stopword and "Licensee's" stems with "Licensee".
- Tokens over 64 chars are dropped before stemming (a base64/URL blob once took seconds in the stemmer). The stemmer's consonant test is a single forward pass; do not reintroduce per-letter back-walks.

**How to apply:** `tests/golden/retrieval.test.ts` pins question → clause in the top 3 for all three fixtures (English, Hinglish, Devanagari). A synonym/stopword change that makes a question miss is a regression: fix the data, do not loosen the test.
