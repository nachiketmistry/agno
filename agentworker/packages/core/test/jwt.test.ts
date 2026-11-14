import { beforeAll, describe, expect, test } from "bun:test";
import { JwtError, verifyJwt } from "../src";
import { type TestKeyPair, generateTestKeyPair, signTestJwt } from "../src/testing";

const NOW = 1_800_000_000;
let keys: TestKeyPair;
let otherKeys: TestKeyPair;

beforeAll(async () => {
  keys = await generateTestKeyPair();
  otherKeys = await generateTestKeyPair();
});

const claims = (extra: Record<string, unknown> = {}) => ({
  sub: "user-1",
  aud: "reference-os",
  exp: NOW + 600,
  scopes: ["agents:read"],
  ...extra,
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof JwtError) return error.code;
    throw error;
  }
  return "no error";
}

describe("verifyJwt", () => {
  test("returns the claims of a valid RS256 token", async () => {
    const token = await signTestJwt(keys.privateKey, claims());
    const verified = await verifyJwt(token, {
      verificationKeys: [keys.publicKeyPem],
      audience: "reference-os",
      now: NOW,
    });
    expect(verified.sub).toBe("user-1");
    expect(verified.scopes).toEqual(["agents:read"]);
  });
  test("accepts a token whose aud list contains the expected audience", async () => {
    const token = await signTestJwt(keys.privateKey, claims({ aud: ["other-os", "reference-os"] }));
    const verified = await verifyJwt(token, {
      verificationKeys: [keys.publicKeyPem],
      audience: "reference-os",
      now: NOW,
    });
    expect(verified.sub).toBe("user-1");
  });
  test("accepts any of several expected audiences", async () => {
    const token = await signTestJwt(keys.privateKey, claims());
    await verifyJwt(token, {
      verificationKeys: [keys.publicKeyPem],
      audience: ["x", "reference-os"],
      now: NOW,
    });
  });
  test("tries each verification key in order", async () => {
    const token = await signTestJwt(keys.privateKey, claims());
    await verifyJwt(token, {
      verificationKeys: [otherKeys.publicKeyPem, keys.publicKeyPem],
      audience: "reference-os",
      now: NOW,
    });
  });
  test("skips the audience check when no audience is expected", async () => {
    const token = await signTestJwt(keys.privateKey, claims({ aud: undefined }));
    await verifyJwt(token, { verificationKeys: [keys.publicKeyPem], now: NOW });
  });
  test("rejects a token signed by another key", async () => {
    const token = await signTestJwt(otherKeys.privateKey, claims());
    expect(
      await codeOf(
        verifyJwt(token, { verificationKeys: [keys.publicKeyPem], audience: "reference-os", now: NOW }),
      ),
    ).toBe("bad_signature");
  });
  test("rejects a token for another OS", async () => {
    const token = await signTestJwt(keys.privateKey, claims({ aud: "other-os" }));
    expect(
      await codeOf(
        verifyJwt(token, { verificationKeys: [keys.publicKeyPem], audience: "reference-os", now: NOW }),
      ),
    ).toBe("invalid_audience");
  });
  test("rejects a token with no aud claim when an audience is expected", async () => {
    const token = await signTestJwt(keys.privateKey, claims({ aud: undefined }));
    expect(
      await codeOf(
        verifyJwt(token, { verificationKeys: [keys.publicKeyPem], audience: "reference-os", now: NOW }),
      ),
    ).toBe("missing_audience");
  });
  test("rejects an expired token", async () => {
    const token = await signTestJwt(keys.privateKey, claims({ exp: NOW - 1 }));
    expect(
      await codeOf(
        verifyJwt(token, { verificationKeys: [keys.publicKeyPem], audience: "reference-os", now: NOW }),
      ),
    ).toBe("expired");
  });
  test("rejects a tampered payload", async () => {
    const token = await signTestJwt(keys.privateKey, claims());
    const [header, , signature] = token.split(".");
    const forged = `${header}.${btoa(JSON.stringify(claims({ scopes: ["agent_os:admin"] }))).replace(/=+$/, "")}.${signature}`;
    expect(
      await codeOf(
        verifyJwt(forged, { verificationKeys: [keys.publicKeyPem], audience: "reference-os", now: NOW }),
      ),
    ).toBe("bad_signature");
  });
  test("rejects a token that names another algorithm", async () => {
    const body = btoa(JSON.stringify(claims())).replace(/=+$/, "");
    const none = `${btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/, "")}.${body}.`;
    expect(
      await codeOf(
        verifyJwt(none, { verificationKeys: [keys.publicKeyPem], audience: "reference-os", now: NOW }),
      ),
    ).toBe("malformed");
  });
  test("rejects text that is not a JWT", async () => {
    expect(await codeOf(verifyJwt("not-a-token", { verificationKeys: [keys.publicKeyPem], now: NOW }))).toBe(
      "malformed",
    );
  });
});
