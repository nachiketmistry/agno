import { describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

describe("schedules", () => {
  test("CompanyOS registers its hourly automation schedule", async () => {
    const schedule = await call("GET", "/schedules/agno-company-automation");
    expect(schedule.status).toBe(200);
    expect(schedule.body).toMatchObject({
      id: "agno-company-automation",
      name: "Company automation",
      method: "GET",
      endpoint: "/company/attention",
      cron_expr: "0 * * * *",
      timezone: "UTC",
      enabled: true,
      managed_by: "company",
    });
    const next = new Date(schedule.body.next_run_at * 1000);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getUTCMinutes()).toBe(0);
  });

  test("a schedule is created with defaults and the next run computed from its cron", async () => {
    const name = unique("nightly");
    const created = await call("POST", "/schedules", {
      json: {
        name,
        cron_expr: "0 3 * * *",
        endpoint: "/workflows/echo-flow/runs",
        method: "POST",
        payload: { message: "x" },
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name,
      method: "POST",
      endpoint: "/workflows/echo-flow/runs",
      payload: { message: "x" },
      cron_expr: "0 3 * * *",
      timezone: "UTC",
      timeout_seconds: 3600,
      max_retries: 0,
      retry_delay_seconds: 60,
      enabled: true,
      managed_by: null,
    });
    const next = new Date(created.body.next_run_at * 1000);
    expect([next.getUTCHours(), next.getUTCMinutes()]).toEqual([3, 0]);
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
    await call("DELETE", `/schedules/${created.body.id}`);
  });

  test("schedule names are unique and cron expressions are validated", async () => {
    const name = unique("unique");
    const body = { name, cron_expr: "0 3 * * *", endpoint: "/workflows/echo-flow/runs", method: "POST" };
    const first = await call("POST", "/schedules", { json: body });
    const second = await call("POST", "/schedules", { json: body });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ detail: `Schedule with name '${name}' already exists` });

    const bad = await call("POST", "/schedules", {
      json: { ...body, name: unique("bad"), cron_expr: "nope" },
    });
    expect(bad.status).toBe(422);
    expect(bad.body).toEqual({ detail: "Invalid cron expression: nope" });
    await call("DELETE", `/schedules/${first.body.id}`);
  });

  test("a schedule can be disabled, enabled, edited and deleted", async () => {
    const created = await call("POST", "/schedules", {
      json: {
        name: unique("life"),
        cron_expr: "0 3 * * *",
        endpoint: "/workflows/echo-flow/runs",
        method: "POST",
      },
    });
    const id = created.body.id;
    const disabled = await call("POST", `/schedules/${id}/disable`);
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({ id, enabled: false });
    const enabled = await call("POST", `/schedules/${id}/enable`);
    expect(enabled.body).toMatchObject({ id, enabled: true });

    const patched = await call("PATCH", `/schedules/${id}`, { json: { description: "Nightly echo" } });
    expect(patched.status).toBe(200);
    expect(patched.body.description).toBe("Nightly echo");

    const runs = await call("GET", `/schedules/${id}/runs`);
    expect(runs.status).toBe(200);
    expect(runs.body.data).toEqual([]);

    expect((await call("DELETE", `/schedules/${id}`)).status).toBe(204);
    expect((await call("GET", `/schedules/${id}`)).status).toBe(404);
  });
});
