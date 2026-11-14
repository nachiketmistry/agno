import { describe, expect, test } from "bun:test";
import { CONTROL_PLANE_ORIGIN, call } from "../support/target";

/** os.agno.com is a browser app, so it reaches a localhost AgentOS only if CORS answers exactly like this. */
describe("CORS for the control plane", () => {
  test("preflight from os.agno.com is allowed with credentials", async () => {
    const result = await call("OPTIONS", "/agents", {
      headers: {
        origin: CONTROL_PLANE_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(result.status).toBe(200);
    expect(result.text).toBe("OK");
    expect(result.headers.get("access-control-allow-origin")).toBe(CONTROL_PLANE_ORIGIN);
    expect(result.headers.get("access-control-allow-credentials")).toBe("true");
    expect(result.headers.get("access-control-allow-headers")).toBe("authorization,content-type");
    expect(result.headers.get("access-control-allow-methods")).toBe(
      "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, QUERY",
    );
    expect(result.headers.get("access-control-max-age")).toBe("600");
  });

  for (const origin of ["https://app.agno.com", "https://os-stg.agno.com", "http://localhost:3000"]) {
    test(`responses to ${origin} carry the allow-origin header`, async () => {
      const result = await call("GET", "/health", { headers: { origin } });
      expect(result.status).toBe(200);
      expect(result.headers.get("access-control-allow-origin")).toBe(origin);
      expect(result.headers.get("access-control-allow-credentials")).toBe("true");
      expect(result.headers.get("access-control-expose-headers")).toBe("*");
      expect(result.headers.get("vary")).toContain("Origin");
    });
  }

  test("an unknown origin gets no allow-origin header", async () => {
    const result = await call("GET", "/health", { headers: { origin: "https://evil.example" } });
    expect(result.status).toBe(200);
    expect(result.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("preflight from an unknown origin is refused", async () => {
    const result = await call("OPTIONS", "/agents", {
      headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
    });
    expect(result.status).toBe(400);
    expect(result.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("errors also carry CORS headers so the browser can read them", async () => {
    const result = await call("GET", "/agents/__missing__", { headers: { origin: CONTROL_PLANE_ORIGIN } });
    expect(result.status).toBe(404);
    expect(result.headers.get("access-control-allow-origin")).toBe(CONTROL_PLANE_ORIGIN);
  });
});
