import { describe, expect, test } from "bun:test";
import {
  DEFAULT_EXPIRY_DAYS,
  DEFAULT_SERVICE_ACCOUNT_SCOPES,
  TOKEN_DISPLAY_PREFIX_LENGTH,
  TOKEN_PREFIX,
  generateToken,
  hashToken,
  isReservedPrincipal,
  isValidServiceAccountName,
  serviceAccountPrincipal,
} from "../src";

describe("service account tokens", () => {
  test("constants match the AgentOS contract", () => {
    expect(TOKEN_PREFIX).toBe("agno_pat_");
    expect(TOKEN_DISPLAY_PREFIX_LENGTH).toBe(16);
    expect(DEFAULT_EXPIRY_DAYS).toBe(90);
    expect([...DEFAULT_SERVICE_ACCOUNT_SCOPES]).toEqual([
      "agents:run",
      "teams:run",
      "workflows:run",
      "sessions:read",
      "config:read",
    ]);
  });
  test("a generated token is prefixed base62 and returned with its hash and display prefix", async () => {
    const token = await generateToken();
    expect(token.plaintext).toMatch(/^agno_pat_[0-9A-Za-z]{30,}$/);
    expect(token.displayPrefix).toBe(token.plaintext.slice(0, 16));
    expect(token.hash).toBe(await hashToken(token.plaintext));
  });
  test("tokens are unique", async () => {
    expect((await generateToken()).plaintext).not.toBe((await generateToken()).plaintext);
  });
  test("hashToken is lowercase hex SHA-256", async () => {
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  test("names are lowercase slugs", () => {
    for (const name of ["ci-bot", "a", "bot_2", "0day"]) expect(isValidServiceAccountName(name)).toBe(true);
    for (const name of ["", "Upper", "sa:evil", "_internal", "me@agno.com", "a.b", "x\n", "a".repeat(64)])
      expect(isValidServiceAccountName(name)).toBe(false);
  });
  test("a service account runs as sa:<name>", () => {
    expect(serviceAccountPrincipal("ci-bot")).toBe("sa:ci-bot");
  });
  test("reserved principals cannot be claimed by a JWT subject", () => {
    expect(isReservedPrincipal("sa:ci-bot")).toBe(true);
    expect(isReservedPrincipal("user-1")).toBe(false);
    expect(isReservedPrincipal(undefined)).toBe(false);
  });
});
