import { describe, expect, test } from "bun:test";
import { agentOsVersion, defaultScopeMappings, matchOperation, operations, pathPattern } from "../src/index";

describe("the exported contract", () => {
  test("has every operation of the Python AgentOS with a unique id", () => {
    expect(operations).toHaveLength(195);
    expect(new Set(operations.map((operation) => `${operation.method} ${operation.path}`)).size).toBe(195);
    expect(agentOsVersion).toBe("1.0.0");
  });

  test("scope mappings name known routes", () => {
    expect(defaultScopeMappings["GET /agents"]).toEqual(["agents:read"]);
    expect(defaultScopeMappings["DELETE /company/routines/*"]).toEqual(["agent_os:admin"]);
  });
});

describe("pathPattern", () => {
  test("a parameter matches one segment", () => {
    expect(pathPattern("/agents/{agent_id}").test("/agents/assistant")).toBe(true);
    expect(pathPattern("/agents/{agent_id}").test("/agents/assistant/runs")).toBe(false);
  });

  test("greedy parameters match the rest of the path", () => {
    expect(pathPattern("/company/wiki/{path}").test("/company/wiki/notes/a.md")).toBe(true);
    expect(pathPattern("/sessions/{session_id}/media/{storage_key}").test("/sessions/s1/media/a/b.png")).toBe(
      true,
    );
  });

  test("literal segments are matched exactly", () => {
    expect(pathPattern("/eval-runs").test("/eval-runs")).toBe(true);
    expect(pathPattern("/eval-runs").test("/evalXruns")).toBe(false);
  });
});

describe("matchOperation", () => {
  test("the most literal template wins", () => {
    expect(matchOperation("GET", "/sessions/filter-schema")?.path).toBe("/sessions/filter-schema");
    expect(matchOperation("GET", "/sessions/abc")?.path).toBe("/sessions/{session_id}");
  });

  test("query strings and a trailing slash are ignored", () => {
    expect(matchOperation("GET", "/agents/?limit=1")?.path).toBe("/agents");
  });

  test("an unknown path or method has no operation", () => {
    expect(matchOperation("GET", "/nope")).toBeUndefined();
    expect(matchOperation("PUT", "/health")).toBeUndefined();
  });
});
