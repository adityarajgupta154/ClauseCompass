import { isIP } from "node:net";

/**
 * A Redis URL's parts, read by one parser for both of its readers:
 * lib/config.ts, which refuses a URL before boot, and redis-socket.ts, which
 * connects with it. One parser, so that a URL the configuration accepted is
 * one the client can use and a URL the client cannot use is refused with the
 * reason at boot, not as an error on the first request.
 *
 * `redis://` is the plain socket, `rediss://` TLS; the userinfo is the ACL
 * user and password, percent-encoded as in any URL; the path is at most a
 * database number. Nothing else in the URL is read, so nothing else is
 * accepted.
 */

export interface RedisTarget {
  host: string;
  port: number;
  tls: boolean;
  username: string | undefined;
  password: string | undefined;
  db: number;
}

/** The parts of a Redis URL the client uses; throws a plain Error naming what is wrong. */
export function parseRedisUrl(value: string): RedisTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("not a URL");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error("the scheme must be redis:// or rediss://");
  if (url.hostname === "") throw new Error("the URL has no host");
  if (url.port === "0") throw new Error("the port must be 1 to 65535");
  const path = url.pathname.replace(/^\//, "");
  if (!/^\d*$/.test(path)) throw new Error("the path must be empty or a database number");
  const db = path === "" ? 0 : Number(path);
  if (!Number.isSafeInteger(db)) throw new Error("the database number is too large");
  if (url.search !== "" || url.hash !== "") throw new Error("query strings and fragments are not read");
  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error("the user name or password is not valid percent-encoding");
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port === "" ? 6379 : Number(url.port),
    tls: url.protocol === "rediss:",
    username: username === "" ? undefined : username,
    password: password === "" ? undefined : password,
    db,
  };
}

/** What is wrong with a Redis URL, or undefined when parseRedisUrl accepts it. */
export function redisUrlProblem(value: string): string | undefined {
  try {
    parseRedisUrl(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * True for a host that is this machine or its private network, where a
 * plain `redis://` socket does not cross the open internet: `localhost`,
 * the loopback ranges, and the address ranges that are never routed
 * publicly (RFC 1918, IPv6 unique-local and link-local). A name other than
 * `localhost` cannot be placed without resolving it, so it is not.
 */
export function isPrivateHost(host: string): boolean {
  if (host === "localhost") return true;
  const family = isIP(host);
  if (family === 4) {
    const [a, b] = host.split(".").map(Number) as [number, number];
    return isPrivateV4(a, b);
  }
  if (family === 6) {
    const lower = host.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("::ffff:")) {
      // An IPv4 address carried in IPv6, dotted (::ffff:10.0.0.1) or as the URL parser writes it (::ffff:a00:1).
      const rest = lower.slice("::ffff:".length);
      if (rest.includes(".")) return isPrivateHost(rest);
      const high = parseInt(rest.split(":")[0] ?? "0", 16);
      return isPrivateV4(high >> 8, high & 0xff);
    }
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return false;
}

function isPrivateV4(a: number, b: number): boolean {
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
