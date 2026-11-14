import { describe, expect, test } from "bun:test";
import { operations } from "@agentworker/contract";
import probes from "@agentworker/contract/fixtures/operation_probes.json";
import { type ProbeRecord, probeKey, probePath } from "../support/probes";
import { call } from "../support/target";

const recorded = probes as Record<string, ProbeRecord>;

/**
 * Operations where the reference's answer to a bare request is not worth matching
 * exactly. Each still has to be routed and built.
 */
const LOOSE: Record<string, string> = {
  "DELETE /approvals/{approval_id}":
    "the reference answers 500 for an unknown approval; a 404 is also acceptable",
  "POST /os/metrics/refresh": "answers 200 or 202 depending on whether a refresh is already running",
  "POST /metrics/refresh": "answers 200 or 202 depending on whether a refresh is already running",
};

describe("every contract operation is served", () => {
  test("the probe fixture covers the whole contract", () => {
    expect(Object.keys(recorded).sort()).toEqual(operations.map(probeKey).sort());
  });

  for (const operation of operations) {
    const key = probeKey(operation);
    const expected = recorded[key];
    test(`${key} (${operation.operationId})`, async () => {
      const result = await call(operation.method, probePath(operation));
      // 501 is how this codebase marks an operation that is routed but not built.
      expect(result.status).not.toBe(501);
      if (LOOSE[key]) {
        expect(result.status).toBeLessThan(501);
        return;
      }
      expect(result.status).toBe(expected!.status);
      if (expected!.detail !== undefined) expect(result.body?.detail).toBe(expected!.detail);
      if (expected!.status === 422)
        expect(Array.isArray(result.body?.detail) || typeof result.body?.detail === "string").toBe(true);
    });
  }
});
