import { describe, expect, test } from "bun:test";
import { operations } from "@agentworker/contract";
import scopeProbes from "@agentworker/contract/fixtures/operation_scope_probes.json";
import { type ProbeRecord, probeKey, probePath } from "../support/probes";
import { AUTH_UNAVAILABLE, CONTROL_PLANE_ORIGIN, auth } from "../support/target";

/**
 * JWT authorization as the control plane uses it: RS256 tokens verified with a public
 * key, scopes checked per route. Needs a target started with a verification key.
 */
describe.skipIf(AUTH_UNAVAILABLE)("JWT authorization", () => {
  describe("public routes", () => {
    for (const path of ["/health", "/", "/info", "/docs", "/openapi.json"]) {
      test(`${path} needs no token`, async () => {
        const { call } = await auth();
        expect((await call("GET", path)).status).toBe(200);
      });
    }

    test("/info reports that JWT auth is on", async () => {
      const { call } = await auth();
      expect((await call("GET", "/info")).body.auth_mode).toBe("jwt");
    });

    test("a CORS preflight needs no token", async () => {
      const { call } = await auth();
      const result = await call("OPTIONS", "/agents", {
        headers: { origin: CONTROL_PLANE_ORIGIN, "access-control-request-method": "GET" },
      });
      expect(result.status).toBe(200);
    });
  });

  describe("rejected tokens", () => {
    test("no Authorization header is 401", async () => {
      const { call } = await auth();
      const result = await call("GET", "/agents");
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ detail: "Authorization header missing" });
    });

    test("an unknown path without a token is 401, not 404", async () => {
      const { call } = await auth();
      expect((await call("GET", "/nope")).status).toBe(401);
    });

    test("a token that is not a JWT is 401", async () => {
      const { call } = await auth();
      const result = await call("GET", "/agents", { token: "abc" });
      expect(result.status).toBe(401);
      expect(result.body.detail).toStartWith("Invalid token");
    });

    test("a token signed by another key is 401", async () => {
      const { call, foreignToken } = await auth();
      const result = await call("GET", "/agents", {
        token: await foreignToken({ scopes: ["agent_os:admin"] }),
      });
      expect(result.status).toBe(401);
      expect(result.body.detail).toStartWith("Invalid token");
    });

    test("an expired token is 401", async () => {
      const { call, token } = await auth();
      const result = await call("GET", "/agents", {
        token: await token({ exp: 1000, scopes: ["agents:read"] }),
      });
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ detail: "Token has expired" });
    });

    test("an unknown service account token is 401", async () => {
      const { call } = await auth();
      const result = await call("GET", "/agents", { token: "agno_pat_unknown" });
      expect(result.status).toBe(401);
      expect(result.body).toEqual({ detail: "Invalid or expired service account token" });
    });

    test("401 responses carry CORS headers so the control plane can read them", async () => {
      const { call } = await auth();
      const result = await call("GET", "/agents", { headers: { origin: CONTROL_PLANE_ORIGIN } });
      expect(result.status).toBe(401);
      expect(result.headers.get("access-control-allow-origin")).toBe(CONTROL_PLANE_ORIGIN);
    });
  });

  describe("scopes", () => {
    test("a valid token with no scopes is 403 and names the missing scope", async () => {
      const { call, token } = await auth();
      const result = await call("GET", "/agents", { token: await token() });
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ detail: "Insufficient permissions. Required scope(s): agents:read" });
    });

    test("the matching scope is 200", async () => {
      const { call, token } = await auth();
      const result = await call("GET", "/agents", { token: await token({ scopes: ["agents:read"] }) });
      expect(result.status).toBe(200);
      expect(result.body.map((agent: { id: string }) => agent.id)).toContain("assistant");
    });

    test("a scope for another resource type is 403", async () => {
      const { call, token } = await auth();
      const result = await call("GET", "/company/products", {
        token: await token({ scopes: ["agents:read"] }),
      });
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ detail: "Insufficient permissions. Required scope(s): products:read" });
    });

    test("agent_os:admin passes every route", async () => {
      const { call, token } = await auth();
      const admin = await token({ scopes: ["agent_os:admin"] });
      for (const path of [
        "/agents",
        "/teams",
        "/workflows",
        "/sessions",
        "/config",
        "/company/products",
        "/service-accounts",
      ]) {
        expect((await call("GET", path, { token: admin })).status).toBe(200);
      }
    });

    test("a per-resource scope filters the listing to that resource", async () => {
      const { call, token } = await auth();
      const own = await call("GET", "/agents", { token: await token({ scopes: ["agents:assistant:read"] }) });
      expect(own.status).toBe(200);
      expect(own.body.map((agent: { id: string }) => agent.id)).toEqual(["assistant"]);
      const other = await call("GET", "/agents", { token: await token({ scopes: ["agents:other:read"] }) });
      expect(other.status).toBe(200);
      expect(other.body).toEqual([]);
    });

    test("a per-resource scope gates the detail route", async () => {
      const { call, token } = await auth();
      const allowed = await call("GET", "/agents/assistant", {
        token: await token({ scopes: ["agents:assistant:read"] }),
      });
      expect(allowed.status).toBe(200);
      const denied = await call("GET", "/agents/assistant", {
        token: await token({ scopes: ["agents:other:read"] }),
      });
      expect(denied.status).toBe(403);
    });

    test("audience is not checked unless the OS opts in", async () => {
      const { call, token } = await auth();
      const result = await call("GET", "/agents", {
        token: await token({ aud: "another-os", scopes: ["agents:read"] }),
      });
      expect(result.status).toBe(200);
    });
  });

  describe("every protected operation", () => {
    const PUBLIC = new Set(["GET /health", "GET /info"]);
    for (const operation of operations) {
      const key = `${operation.method} ${operation.path}`;
      if (PUBLIC.has(key)) continue;
      test(`${key} is 401 without a token`, async () => {
        const { call } = await auth();
        expect((await call(operation.method, probePath(operation))).status).toBe(401);
      });
    }
  });

  describe("a valid token with no scopes", () => {
    const recorded = scopeProbes as Record<string, ProbeRecord>;
    for (const operation of operations) {
      const key = probeKey(operation);
      const expected = recorded[key]!;
      test(`${key} is ${expected.status}`, async () => {
        const { call, token } = await auth();
        const result = await call(operation.method, probePath(operation), { token: await token() });
        expect(result.status).toBe(expected.status);
        if (expected.status === 403) expect(result.body?.detail).toBe(expected.detail);
      });
    }
  });
});
