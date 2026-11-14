import { describe, expect, test } from "bun:test";
import { normalize } from "../support/normalize";
import { call } from "../support/target";

interface Fixture {
  request: { method: string; path: string; json?: unknown; headers?: Record<string, string> };
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Responses recorded from the Python AgentOS that do not depend on stored data.
 * The server under test must return the same status and the same body, ignoring
 * generated ids and clock values.
 */
const STATELESS = [
  "health",
  "home",
  "info",
  "config",
  "agents",
  "agent",
  "agent_not_found",
  "teams",
  "workflows",
  "validation_error",
];

describe("recorded responses replay", () => {
  for (const name of STATELESS) {
    test(name, async () => {
      const fixture = (await import(`@agentworker/contract/fixtures/${name}.json`)).default as Fixture;
      const result = await call(fixture.request.method, fixture.request.path, {
        json: fixture.request.json,
        headers: fixture.request.headers,
      });
      expect(result.status).toBe(fixture.status);
      expect(result.headers.get("content-type")).toBe(fixture.headers["content-type"] ?? null);
      expect(normalize(result.body)).toEqual(normalize(fixture.body));
    });
  }
});
