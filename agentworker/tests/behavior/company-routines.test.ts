import { beforeAll, describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

describe("CompanyOS routines", () => {
  let productId: string;

  beforeAll(async () => {
    productId = (await call("POST", "/company/products", { json: { name: unique("routines") } })).body?.id;
  });

  const createRoutine = (extra: Record<string, unknown> = {}) =>
    call("POST", "/company/routines", {
      json: { product_id: productId, name: unique("routine"), instructions: "Summarize the week", ...extra },
    });

  test("a cron routine becomes a company-managed schedule that runs the mini agent", async () => {
    const name = unique("weekly");
    const routine = await createRoutine({ name, cron_expr: "0 9 * * 1" });
    expect(routine.status).toBe(201);
    expect(routine.body).toMatchObject({
      name: `${productId}.${name}`,
      method: "POST",
      endpoint: "/agents/miniagent/runs",
      managed_by: "company",
      target_type: "agent",
      target_id: "miniagent",
      cron_expr: "0 9 * * 1",
      timezone: "UTC",
      schedule_type: "scheduled",
      enabled: true,
      timeout_seconds: 3600,
      max_retries: 0,
      retry_delay_seconds: 60,
      payload: {
        message: `Operate only on Product "${productId}".\n\nSummarize the week`,
        metadata: { auto_accept: false, product_id: productId, template: null },
      },
    });
    // The next run is a Monday 09:00 UTC in the future.
    const next = new Date(routine.body.next_run_at * 1000);
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect([next.getUTCDay(), next.getUTCHours(), next.getUTCMinutes()]).toEqual([1, 9, 0]);
  });

  test("a routine without a cron expression is on demand", async () => {
    const routine = await createRoutine();
    expect(routine.status).toBe(201);
    expect(routine.body).toMatchObject({
      schedule_type: "on_demand",
      cron_expr: null,
      next_run_at: null,
      enabled: true,
    });
  });

  test("auto_accept true expands to the default policy", async () => {
    const routine = await createRoutine({ auto_accept: true });
    expect(routine.status).toBe(201);
    expect(routine.body.payload.metadata.auto_accept).toEqual({
      default_executor: "miniagent",
      executors: null,
      executor_type: "agent",
      executor_id: "miniagent",
      source_ids: null,
      work_scope: null,
      required_checks: ["executor_registered"],
      limits: null,
      complete_projects: false,
      approve_projects: true,
      max_open: 5,
    });
  });

  test("instructions are required without a template", async () => {
    const result = await call("POST", "/company/routines", {
      json: { product_id: productId, name: unique("bare") },
    });
    expect(result.status).toBe(422);
    expect(result.body.detail[0].msg).toBe(
      "Value error, Routine instructions are required without a template",
    );
  });

  test("an invalid cron expression is 422", async () => {
    const result = await createRoutine({ cron_expr: "not a cron" });
    expect(result.status).toBe(422);
    expect(result.body.detail[0].msg).toBe("Value error, Invalid cron expression");
  });

  test("an invalid timezone is 422", async () => {
    const result = await createRoutine({ cron_expr: "0 9 * * 1", timezone: "Mars/Olympus" });
    expect(result.status).toBe(422);
    expect(result.body.detail[0].msg).toBe("Value error, Invalid timezone");
  });

  test("a routine for an unknown product is 404", async () => {
    const result = await call("POST", "/company/routines", {
      json: { product_id: "__missing__", name: "x", instructions: "Do" },
    });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ detail: "Product not found" });
  });

  test("a routine name is unique within its product", async () => {
    const name = unique("dup");
    expect((await createRoutine({ name })).status).toBe(201);
    const second = await createRoutine({ name });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ detail: `Schedule with name '${productId}.${name}' already exists` });
  });

  test("a scheduled routine can be paused, resumed and rescheduled", async () => {
    const routine = await createRoutine({ cron_expr: "0 9 * * 1" });
    const id = routine.body.id;
    const paused = await call("POST", `/company/routines/${id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.enabled).toBe(false);
    const resumed = await call("POST", `/company/routines/${id}/resume`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.enabled).toBe(true);

    const patched = await call("PATCH", `/company/routines/${id}`, { json: { cron_expr: "0 10 * * 1" } });
    expect(patched.status).toBe(200);
    expect(patched.body.cron_expr).toBe("0 10 * * 1");
    expect(new Date(patched.body.next_run_at * 1000).getUTCHours()).toBe(10);
  });

  test("an on-demand routine cannot be paused or resumed", async () => {
    const routine = await createRoutine();
    const paused = await call("POST", `/company/routines/${routine.body.id}/pause`);
    expect(paused.status).toBe(409);
    expect(paused.body).toEqual({ detail: "On-demand Routines cannot be paused" });
    const resumed = await call("POST", `/company/routines/${routine.body.id}/resume`);
    expect(resumed.status).toBe(409);
    expect(resumed.body).toEqual({ detail: "On-demand Routine is already enabled" });
  });

  test("routines are listed per product and have a run history", async () => {
    const product = (await call("POST", "/company/products", { json: { name: unique("listing") } })).body;
    const routine = await call("POST", "/company/routines", {
      json: { product_id: product.id, name: "Only", instructions: "Do" },
    });
    const listed = await call("GET", `/company/routines?product_id=${product.id}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((item: { id: string }) => item.id)).toEqual([routine.body.id]);
    const runs = await call("GET", `/company/routines/${routine.body.id}/runs`);
    expect(runs.status).toBe(200);
    expect(runs.body.data).toEqual([]);
  });

  test("archive disables and hides a routine; restore and delete work", async () => {
    const routine = await createRoutine({ cron_expr: "0 9 * * 1" });
    const id = routine.body.id;
    const archived = await call("POST", `/company/routines/${id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.enabled).toBe(false);
    expect(archived.body.deleted_at).toBeNumber();
    const hidden = await call("GET", `/company/routines/${id}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual({ detail: "Routine not found" });

    const restored = await call("POST", `/company/routines/${id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.deleted_at).toBeNull();

    expect((await call("DELETE", `/company/routines/${id}`)).status).toBe(204);
    const gone = await call("GET", `/company/routines/${id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ detail: "Schedule not found" });
  });

  test("a routine cannot be triggered once its product is archived", async () => {
    const product = (await call("POST", "/company/products", { json: { name: unique("archived") } })).body;
    const routine = await call("POST", "/company/routines", {
      json: { product_id: product.id, name: "Later", instructions: "Do" },
    });
    await call("DELETE", `/company/products/${product.id}`);
    const triggered = await call("POST", `/company/routines/${routine.body.id}/trigger`);
    expect(triggered.status).toBe(404);
    expect(triggered.body).toEqual({ detail: "Product not found" });
  });

  test("routines cannot be changed through the generic schedules API", async () => {
    const routine = await createRoutine({ cron_expr: "0 9 * * 1" });
    const result = await call("POST", `/schedules/${routine.body.id}/disable`);
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      detail: "Company-managed schedules must be changed through /company/routines",
    });
  });
});
