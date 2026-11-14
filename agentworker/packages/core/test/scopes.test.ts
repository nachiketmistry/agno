import { describe, expect, test } from "bun:test";
import mappingsJson from "@agentworker/contract/scope-mappings.json";
import {
  LEGACY_RESOURCE_ALIASES,
  type ScopeMappings,
  checkRouteScopes,
  getAccessibleResourceIds,
  getRequiredScopesForRoute,
  getResourceContextFromPath,
  hasRequiredScopes,
  parseScope,
  splitScope,
} from "../src";

// Ported from libs/agno/tests/unit/os/test_scopes.py. The mappings are exported from the
// Python AgentOS with CompanyOS on, so route expectations cannot drift from upstream.
const mappings = mappingsJson as ScopeMappings;

describe("parseScope", () => {
  test("parses a global scope", () => {
    expect(parseScope("agents:read")).toMatchObject({
      scopeType: "global",
      resource: "agents",
      action: "read",
    });
  });
  test("parses a per-resource scope", () => {
    expect(parseScope("agents:web-agent:run")).toMatchObject({
      scopeType: "per_resource",
      resource: "agents",
      resourceId: "web-agent",
      action: "run",
      isWildcardResource: false,
    });
  });
  test("parses a wildcard resource scope", () => {
    expect(parseScope("agents:*:run")).toMatchObject({
      scopeType: "per_resource",
      resourceId: "*",
      isWildcardResource: true,
    });
  });
  test("parses the admin scope", () => {
    expect(parseScope("agent_os:admin").scopeType).toBe("admin");
  });
  test("honours a custom admin scope", () => {
    expect(parseScope("root:all", "root:all").scopeType).toBe("admin");
    expect(parseScope("agent_os:admin", "root:all").scopeType).toBe("global");
  });
  test("aliases the legacy system scope to config", () => {
    expect(parseScope("system:read")).toMatchObject({
      resource: "config",
      action: "read",
      raw: "system:read",
    });
  });
  test("aliases a legacy per-resource system scope", () => {
    expect(parseScope("system:x:read")).toMatchObject({ resource: "config", resourceId: "x" });
  });
  test("marks other shapes unknown", () => {
    expect(parseScope("nonsense").scopeType).toBe("unknown");
    expect(parseScope("a:b:c:d").scopeType).toBe("unknown");
  });
});

describe("splitScope", () => {
  test("global scope", () => expect(splitScope("agents:read")).toEqual(["agents", null, "read"]));
  test("per-resource scope", () => expect(splitScope("agents:web:run")).toEqual(["agents", "web", "run"]));
  test("wildcard scope", () => expect(splitScope("agents:*:run")).toEqual(["agents", "*", "run"]));
  test("admin scope splits literally", () =>
    expect(splitScope("agent_os:admin")).toEqual(["agent_os", null, "admin"]));
  test("legacy namespace renders under its current name", () =>
    expect(splitScope("system:read")).toEqual(["config", null, "read"]));
  test("extra segments fold into the sub-namespace", () =>
    expect(splitScope("agents:a:b:run")).toEqual(["agents", "a:b", "run"]));
  test("malformed scope", () => expect(splitScope("nonsense")).toEqual(["nonsense", null, "unknown"]));
});

describe("hasRequiredScopes", () => {
  test("no required scopes always passes", () => expect(hasRequiredScopes([], [])).toBe(true));
  test("legacy system scope grants config access", () =>
    expect(hasRequiredScopes(["system:read"], ["config:read"])).toBe(true));
  test("config scope works", () => expect(hasRequiredScopes(["config:read"], ["config:read"])).toBe(true));
  test("system scope does not grant unrelated access", () =>
    expect(hasRequiredScopes(["system:read"], ["agents:read"])).toBe(false));
  test("registry scope is distinct from config", () =>
    expect(hasRequiredScopes(["config:read"], ["registry:read"])).toBe(false));
  test("admin scope grants everything", () =>
    expect(hasRequiredScopes(["agent_os:admin"], ["agents:write", "sessions:delete"])).toBe(true));
  test("missing scope is denied", () => expect(hasRequiredScopes([], ["agents:read"])).toBe(false));
  test("every required scope must be held", () =>
    expect(hasRequiredScopes(["agents:read"], ["agents:read", "sessions:read"])).toBe(false));
  test("per-resource scope satisfies its own resource", () =>
    expect(
      hasRequiredScopes(["agents:web:run"], ["agents:run"], { resourceType: "agents", resourceId: "web" }),
    ).toBe(true));
  test("per-resource scope does not satisfy another resource", () =>
    expect(
      hasRequiredScopes(["agents:web:run"], ["agents:run"], { resourceType: "agents", resourceId: "other" }),
    ).toBe(false));
  test("wildcard scope satisfies any resource", () =>
    expect(
      hasRequiredScopes(["agents:*:run"], ["agents:run"], { resourceType: "agents", resourceId: "any" }),
    ).toBe(true));
  test("global scope satisfies a per-resource requirement", () =>
    expect(
      hasRequiredScopes(["agents:run"], ["agents:run"], { resourceType: "agents", resourceId: "any" }),
    ).toBe(true));
  test("a per-resource scope does not satisfy a foreign family requirement", () =>
    expect(
      hasRequiredScopes(["agents:web:read"], ["sessions:read"], {
        resourceType: "agents",
        resourceId: "web",
      }),
    ).toBe(false));
});

describe("getAccessibleResourceIds", () => {
  test("collects specific ids", () =>
    expect(getAccessibleResourceIds(["agents:a1:read", "agents:a2:read"], "agents")).toEqual(
      new Set(["a1", "a2"]),
    ));
  test("wildcard and global scopes return *", () => {
    expect(getAccessibleResourceIds(["agents:*:read"], "agents")).toEqual(new Set(["*"]));
    expect(getAccessibleResourceIds(["agents:read"], "agents")).toEqual(new Set(["*"]));
  });
  test("admin returns *", () =>
    expect(getAccessibleResourceIds(["agent_os:admin"], "agents")).toEqual(new Set(["*"])));
  test("filters by action when given", () =>
    expect(getAccessibleResourceIds(["agents:a1:read"], "agents", { action: "run" })).toEqual(new Set()));
  test("other families are ignored", () =>
    expect(getAccessibleResourceIds(["teams:t1:read"], "agents")).toEqual(new Set()));
  test("legacy alias table is system to config", () =>
    expect(LEGACY_RESOURCE_ALIASES).toEqual({ system: "config" }));
});

describe("getRequiredScopesForRoute", () => {
  test("config endpoints require config:read", () => {
    expect(getRequiredScopesForRoute(mappings, "GET", "/config")).toEqual(["config:read"]);
  });
  test("database migrations require config:write", () => {
    expect(getRequiredScopesForRoute(mappings, "POST", "/databases/abc/migrate")).toEqual(["config:write"]);
  });
  test("registry has its own scope", () => {
    expect(getRequiredScopesForRoute(mappings, "GET", "/registry")).toEqual(["registry:read"]);
  });
  test("learnings user deletion requires learnings:delete", () => {
    expect(getRequiredScopesForRoute(mappings, "DELETE", "/learnings/users/priti@agno.com")).toEqual([
      "learnings:delete",
    ]);
  });
  test("path parameters match one segment pattern", () => {
    expect(getRequiredScopesForRoute(mappings, "DELETE", "/company/products/p1")).toEqual([
      "products:delete",
    ]);
  });
  test("unmapped routes need nothing", () => {
    expect(getRequiredScopesForRoute(mappings, "GET", "/totally/unmapped")).toEqual([]);
  });
  test("method must match", () => {
    expect(getRequiredScopesForRoute({ "GET /x": ["a:read"] }, "POST", "/x")).toEqual([]);
  });
  test("brace patterns match like wildcards", () => {
    expect(getRequiredScopesForRoute({ "GET /x/{id}": ["a:read"] }, "GET", "/x/1")).toEqual(["a:read"]);
  });
});

describe("getResourceContextFromPath", () => {
  test("foreign family paths are not classified", () => {
    expect(getResourceContextFromPath("/knowledge/content/agents-onboarding")).toEqual([null, null]);
    expect(getResourceContextFromPath("/traces/agents-run-1")).toEqual([null, null]);
    expect(getResourceContextFromPath("/eval-runs/teams-eval")).toEqual([null, null]);
    expect(getResourceContextFromPath("/agentsfoo")).toEqual([null, null]);
  });
  test("real family paths classify", () => {
    expect(getResourceContextFromPath("/agents")).toEqual(["agents", null]);
    expect(getResourceContextFromPath("/agents/a1/runs")).toEqual(["agents", "a1"]);
    expect(getResourceContextFromPath("/teams/t1")).toEqual(["teams", "t1"]);
    expect(getResourceContextFromPath("/workflows")).toEqual(["workflows", null]);
  });
  test("a2a paths classify by their family", () => {
    expect(getResourceContextFromPath("/a2a/agents/a1")).toEqual(["agents", "a1"]);
  });
});

describe("checkRouteScopes", () => {
  test("a GET listing allows through with accessible ids", () => {
    const result = checkRouteScopes(["agents:a1:read"], mappings, "GET", "/agents");
    expect(result.allowed).toBe(true);
    expect(result.accessibleResourceIds).toEqual(new Set(["a1"]));
  });
  test("a non-GET id-less route is not allowed through", () => {
    const result = checkRouteScopes(["agents:a1:read"], mappings, "POST", "/agents");
    expect(result.allowed).toBe(false);
    expect(result.accessibleResourceIds).toBeUndefined();
  });
  test("a caller with the required scope is allowed", () => {
    expect(checkRouteScopes(["agents:write"], mappings, "POST", "/agents").allowed).toBe(true);
  });
  test("an unmapped route is allowed", () => {
    const result = checkRouteScopes([], mappings, "GET", "/totally/unmapped");
    expect(result.allowed).toBe(true);
    expect(result.requiredScopes).toEqual([]);
  });
  test("refresh status needs metrics:read", () => {
    expect(checkRouteScopes([], mappings, "GET", "/metrics/refresh/status").allowed).toBe(false);
    expect(checkRouteScopes(["metrics:read"], mappings, "GET", "/metrics/refresh/status").allowed).toBe(true);
  });
  for (const route of ["models", "sessions", "tokens", "users", "runs", "latency", "refresh/status"]) {
    test(`os metrics ${route} needs metrics:read`, () => {
      expect(checkRouteScopes(["agents:a1:run"], mappings, "GET", `/os/metrics/${route}`).allowed).toBe(
        false,
      );
      expect(checkRouteScopes(["metrics:read"], mappings, "GET", `/os/metrics/${route}`).allowed).toBe(true);
    });
  }
  test("os metrics refresh needs metrics:write", () => {
    expect(checkRouteScopes(["metrics:read"], mappings, "POST", "/os/metrics/refresh").allowed).toBe(false);
    expect(checkRouteScopes(["metrics:write"], mappings, "POST", "/os/metrics/refresh").allowed).toBe(true);
  });
  test("an under-scoped GET of a foreign family is denied", () => {
    const result = checkRouteScopes(
      ["sessions:read"],
      mappings,
      "GET",
      "/knowledge/content/agents-onboarding",
    );
    expect(result.allowed).toBe(false);
    expect(result.accessibleResourceIds).toBeUndefined();
  });
  test("an under-scoped GET of traces with an agents substring is denied", () => {
    expect(checkRouteScopes(["agents:read"], mappings, "GET", "/traces/agents-run-1").allowed).toBe(false);
  });
  test("knowledge content refresh requires knowledge:write", () => {
    expect(checkRouteScopes([], mappings, "POST", "/knowledge/content/abc/refresh").allowed).toBe(false);
    expect(
      checkRouteScopes(["knowledge:write"], mappings, "POST", "/knowledge/content/abc/refresh").allowed,
    ).toBe(true);
    expect(
      checkRouteScopes(["knowledge:read"], mappings, "POST", "/knowledge/content/abc/refresh").allowed,
    ).toBe(false);
  });
  test("admin passes every mapped route", () => {
    expect(checkRouteScopes(["agent_os:admin"], mappings, "DELETE", "/company/routines/r1").allowed).toBe(
      true,
    );
  });
});
