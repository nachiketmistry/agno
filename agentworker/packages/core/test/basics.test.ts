import { describe, expect, test } from "bun:test";
import {
  ADMIN_SCOPE,
  NotImplementedError,
  SERVICE_ACCOUNT_PRINCIPAL_PREFIX,
  notImplemented,
} from "../src/index";
import { generateTestKeyPair, importPrivateKeyPem, signTestJwt } from "../src/testing";

describe("constants shared with the Python AgentOS", () => {
  test("the admin scope", () => {
    expect(ADMIN_SCOPE).toBe("agent_os:admin");
  });

  test("the service account principal prefix", () => {
    expect(SERVICE_ACCOUNT_PRINCIPAL_PREFIX).toBe("sa:");
  });
});

describe("notImplemented", () => {
  test("throws an error that names what is missing", () => {
    expect(() => notImplemented("verifyJwt")).toThrow(NotImplementedError);
    expect(() => notImplemented("verifyJwt")).toThrow("verifyJwt is not implemented yet");
  });
});

describe("test key helpers", () => {
  test("an exported private key imports again and signs a three-part RS256 token", async () => {
    const pair = await generateTestKeyPair();
    expect(pair.publicKeyPem).toStartWith("-----BEGIN PUBLIC KEY-----");
    const key = await importPrivateKeyPem(pair.privateKeyPem);
    const token = await signTestJwt(key, { sub: "user-1" });
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(atob(header!))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(atob(payload!.replace(/-/g, "+").replace(/_/g, "/")))).toEqual({ sub: "user-1" });
    expect(signature!.length).toBeGreaterThan(300);
  });
});
