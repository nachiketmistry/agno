import { describe, expect, test } from "bun:test";
import { call } from "../support/target";

describe("HTTP error shapes", () => {
  test("unknown path is 404 with a detail string", async () => {
    const result = await call("GET", "/nope");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ detail: "Not Found" });
  });

  test("known path with the wrong method is 405", async () => {
    const result = await call("PUT", "/health");
    expect(result.status).toBe(405);
    expect(result.body).toEqual({ detail: "Method Not Allowed" });
  });

  test("a trailing slash reaches the same route", async () => {
    const result = await call("GET", "/health/");
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("ok");
  });

  test("a missing resource is 404 with a resource-specific message", async () => {
    for (const [path, detail] of [
      ["/agents/__missing__", "Agent not found"],
      ["/teams/__missing__", "Team not found"],
      ["/workflows/__missing__", "Workflow not found"],
      ["/sessions/__missing__", "Session with id '__missing__' not found"],
      ["/company/products/__missing__", "Product not found"],
      ["/company/routines/__missing__", "Schedule not found"],
    ] as const) {
      const result = await call("GET", path);
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ detail });
    }
  });

  test("a body that fails validation is 422 with one entry per problem", async () => {
    const result = await call("POST", "/company/products", { json: {} });
    expect(result.status).toBe(422);
    expect(result.body.detail).toBeArray();
    const [problem] = result.body.detail;
    expect(problem.type).toBe("missing");
    expect(problem.loc).toEqual(["body", "name"]);
    expect(problem.msg).toBe("Field required");
  });

  test("malformed JSON is 422", async () => {
    const result = await call("POST", "/company/products", {
      headers: { "content-type": "application/json" },
      raw: "{not json",
    });
    expect(result.status).toBe(422);
    expect(result.body.detail[0].type).toBe("json_invalid");
  });

  test("the OpenAPI document is served and lists every contract path", async () => {
    const { operations } = await import("@agentworker/contract");
    const result = await call("GET", "/openapi.json");
    expect(result.status).toBe(200);
    expect(result.body.openapi).toStartWith("3.");
    const served = new Set(Object.keys(result.body.paths));
    expect(
      operations.filter((operation) => !served.has(operation.path)).map((operation) => operation.path),
    ).toEqual([]);
  });

  test("the interactive docs page is served", async () => {
    const result = await call("GET", "/docs");
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("text/html");
  });
});
