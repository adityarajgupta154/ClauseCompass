const SESSION_PATH = /(\/sessions\/)[^/?#]+/;

/**
 * The request line as it goes to the log: no query string, and a session id
 * replaced by a placeholder. The id is the only handle to a reader's
 * document, so it must not sit in log storage.
 */
export function loggableUrl(url: string | undefined): string | undefined {
  return url?.split("?")[0]?.replace(SESSION_PATH, "$1:id");
}
