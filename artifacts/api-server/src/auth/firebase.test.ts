import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyObject } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirebaseVerifier } from "./firebase";
import { AuthError } from "./verifier";

/**
 * The Firebase token check, offline: a key pair generated here stands in
 * for Google's, published from a local JWKS endpoint, and tokens are minted
 * with the claims Firebase sets. What must pass passes; every way a token
 * can be wrong is refused as "invalid"; a key server that cannot be reached
 * is "unavailable", which says nothing against the token.
 */

const PROJECT = "clausecompass-test";
const ISSUER = `https://securetoken.google.com/${PROJECT}`;

let privateKey: KeyObject;
let otherPrivateKey: KeyObject;
let jwks: { keys: JWK[] };
let server: Server;
let jwksUrl: string;
let fetches = 0;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const other = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey as KeyObject;
  otherPrivateKey = other.privateKey as KeyObject;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "key-1", alg: "RS256", use: "sig" }] };
  server = createServer((_req, res) => {
    fetches += 1;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(jwks));
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

interface Mint {
  key?: KeyObject;
  kid?: string;
  alg?: string;
  sub?: string | null;
  aud?: string;
  iss?: string;
  expiresIn?: string;
  issuedAt?: number;
  /** null leaves the claim out. */
  authTime?: number | null;
}

/** A token as Firebase issues it, unless a field says otherwise. */
async function mint(options: Mint = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = { firebase: { sign_in_provider: "google.com" } };
  if (options.authTime !== null) payload.auth_time = options.authTime ?? now - 5;
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: options.alg ?? "RS256", kid: options.kid ?? "key-1", typ: "JWT" })
    .setIssuedAt(options.issuedAt ?? now - 5)
    .setExpirationTime(options.expiresIn ?? "1h")
    .setIssuer(options.iss ?? ISSUER)
    .setAudience(options.aud ?? PROJECT);
  if (options.sub !== null) jwt = jwt.setSubject(options.sub ?? "firebase-uid-1");
  return jwt.sign(options.key ?? privateKey);
}

async function refusal(promise: Promise<unknown>): Promise<AuthError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }
  throw new Error("expected the token to be refused");
}

describe("createFirebaseVerifier", () => {
  it("accepts a token signed by a published key for this project and returns its uid", async () => {
    const verifier = createFirebaseVerifier({ projectId: PROJECT, jwksUrl });
    await expect(verifier.verify(await mint())).resolves.toEqual({ uid: "firebase-uid-1" });
    // The key set is fetched once and reused for the next token.
    const before = fetches;
    await expect(verifier.verify(await mint({ sub: "firebase-uid-2" }))).resolves.toEqual({ uid: "firebase-uid-2" });
    expect(fetches).toBe(before);
  });

  it("refuses a token for another project, from another issuer, expired, not yet issued, or without a sign-in time", async () => {
    const verifier = createFirebaseVerifier({ projectId: PROJECT, jwksUrl });
    const now = Math.floor(Date.now() / 1000);
    // Clock skew within five minutes is not a refusal.
    await expect(verifier.verify(await mint({ issuedAt: now + 120, authTime: now + 120 }))).resolves.toEqual({ uid: "firebase-uid-1" });
    for (const bad of [
      mint({ aud: "someone-elses-project" }),
      mint({ iss: "https://securetoken.google.com/someone-elses-project" }),
      mint({ iss: "https://accounts.google.com" }),
      mint({ expiresIn: "-1m" }),
      mint({ issuedAt: now + 3600 }),
      mint({ authTime: now + 3600 }),
      mint({ authTime: null }),
    ]) {
      const error = await refusal(verifier.verify(await bad));
      expect(error.kind).toBe("invalid");
    }
  });

  it("refuses a token signed by a key that is not published, whatever kid it claims", async () => {
    const verifier = createFirebaseVerifier({ projectId: PROJECT, jwksUrl });
    expect((await refusal(verifier.verify(await mint({ key: otherPrivateKey })))).kind).toBe("invalid");
    expect((await refusal(verifier.verify(await mint({ key: otherPrivateKey, kid: "key-2" })))).kind).toBe("invalid");
  });

  it("refuses a token without a usable subject, or that is not a JWT at all", async () => {
    const verifier = createFirebaseVerifier({ projectId: PROJECT, jwksUrl });
    expect((await refusal(verifier.verify(await mint({ sub: null })))).kind).toBe("invalid");
    expect((await refusal(verifier.verify(await mint({ sub: "" })))).kind).toBe("invalid");
    expect((await refusal(verifier.verify(await mint({ sub: "x".repeat(129) })))).kind).toBe("invalid");
    expect((await refusal(verifier.verify("not.a.jwt"))).kind).toBe("invalid");
    expect((await refusal(verifier.verify(""))).kind).toBe("invalid");
    // alg=none: a header that names no algorithm is not a signature.
    const [header, payload] = (await mint()).split(".");
    const none = Buffer.from(JSON.stringify({ alg: "none", kid: "key-1" })).toString("base64url");
    expect((await refusal(verifier.verify(`${none}.${payload}.`))).kind).toBe("invalid");
    expect(header).toBeDefined();
  });

  it("reports a key server it cannot reach as unavailable, not as a bad token", async () => {
    const verifier = createFirebaseVerifier({ projectId: PROJECT, jwksUrl: "http://127.0.0.1:9/jwks", fetchTimeoutMs: 2_000 });
    const error = await refusal(verifier.verify(await mint()));
    expect(error.kind).toBe("unavailable");
  });
});
