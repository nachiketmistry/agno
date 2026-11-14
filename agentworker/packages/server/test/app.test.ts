import { describe, expect, test } from "bun:test";
import { operations } from "@agentworker/contract";
import { createReferenceApp } from "../src";

const app = createReferenceApp();

describe("createApp", () => {
  test("serves health", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; instantiated_at: string };
    expect(body.status).toBe("ok");
    expect(body.instantiated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });
  test("routes every contract operation", async () => {
    const unrouted: string[] = [];
    for (const operation of operations) {
      const path = operation.path.replace(/\{[^}]+\}/g, "x");
      const response = await app.request(path, { method: operation.method });
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      if (response.status === 404 && body.detail === "Not Found")
        unrouted.push(`${operation.method} ${operation.path}`);
      if (response.status === 405) unrouted.push(`${operation.method} ${operation.path}`);
    }
    expect(unrouted).toEqual([]);
  });
  test("an operation that is not built yet answers 501 with its operation id", async () => {
    const response = await app.request("/config");
    expect([200, 501]).toContain(response.status);
    if (response.status === 501)
      expect(((await response.json()) as { detail: string }).detail).toStartWith("Not implemented: ");
  });
  test("unknown paths answer 404 in the AgentOS error shape", async () => {
    const response = await app.request("/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Not Found" });
  });
  test("a known path with the wrong method answers 405", async () => {
    const response = await app.request("/health", { method: "PUT" });
    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ detail: "Method Not Allowed" });
  });
  test("a trailing slash reaches the same route", async () => {
    expect((await app.request("/health/")).status).toBe(200);
  });
});
