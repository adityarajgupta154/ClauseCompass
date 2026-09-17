---
name: Upload name handling (multer/busboy)
description: Why multer's defaults were changed for uploads and what the parser does to file names before the API sees them.
---
- **Rule:** every upload route goes through the one multer factory (`preservePath: true`, `defParamCharset: "utf8"`); a path-like, control-character, blank or over-long name is refused, never quietly basenamed. Dot checks (`.`/`..`) run on the *cleaned* name — an invisible U+202E after the dots once slipped a `..` through.
- **Why:** busboy's default `preservePath: false` reduces `../../etc/passwd` to `passwd` *before* any check, so the traversal case would be silently accepted (201) instead of rejected; the default Latin-1 param charset mojibakes Devanagari names (the name is shown back in a session). Browsers and curl only ever send base names, so a path-looking name is a crafted request and can be refused outright.
- **Parser facts (busboy via multer 2.x):** keeps backslashes in `filename="..\..\x"` (no quoted-pair unescaping); a NUL or BEL in a header fails with "Malformed part header" (→ 400 `bad-upload`), a TAB passes through; multer decodes `%0A`/`%0D`/`%22` back into `\n \r "`, so newline names arrive via fetch's own FormData encoding; a `"` inside a filename breaks the part (no file → `no-file`).
- **How to apply:** any new file route must use `documentUpload(...)`; test hostile names with fetch FormData for percent-round-trips and a hand-built multipart body for raw control chars; a zero-byte file is 422 `empty` (checked before the magic bytes, in `extractDocument`).
