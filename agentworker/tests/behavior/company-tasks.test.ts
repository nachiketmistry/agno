import { beforeAll, describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

describe("CompanyOS tasks", () => {
  let productId: string;
  let proposedProjectId: string;
  let activeProjectId: string;

  beforeAll(async () => {
    productId = (await call("POST", "/company/products", { json: { name: unique("tasks") } })).body?.id;
    proposedProjectId = (
      await call("POST", "/company/projects", { json: { product_id: productId, name: "Proposed" } })
    ).body?.id;
    activeProjectId = (
      await call("POST", "/company/projects", { json: { product_id: productId, name: "Active" } })
    ).body?.id;
    await call("POST", `/company/projects/${activeProjectId}/transitions`, {
      json: { target: "active", reason: "Approved" },
    });
  });

  const createTask = (projectId: string, extra: Record<string, unknown> = {}) =>
    call("POST", "/company/tasks", {
      json: { product_id: productId, project_id: projectId, title: unique("task"), ...extra },
    });

  test("a task starts in the backlog as human work with its allowed transitions", async () => {
    const task = await createTask(proposedProjectId, {
      brief: "Summarize changes",
      evidence: [{ reference: "Release notes" }],
    });
    expect(task.status).toBe(201);
    expect(task.body).toMatchObject({
      product_id: productId,
      project_id: proposedProjectId,
      status: "backlog",
      origin: "human",
      brief: "Summarize changes",
      evidence: [{ reference: "Release notes" }],
      transitions: [],
      routine_id: null,
      executor_type: null,
      executor_id: null,
      sandboxed: false,
    });
    expect(task.body.session_id).toBeString();
    expect(task.body.allowed_transitions).toEqual([
      { target: "ready", allowed: true, reason: null, starts_run: false },
      { target: "in_progress", allowed: true, reason: null, starts_run: true },
      {
        target: "in_review",
        allowed: false,
        reason: "Review requires a previous Task attempt",
        starts_run: false,
      },
      {
        target: "done",
        allowed: false,
        reason: "Completion requires a previous Task attempt",
        starts_run: false,
      },
      { target: "cancelled", allowed: true, reason: null, starts_run: false },
    ]);
  });

  test("a task needs product_id, project_id and title", async () => {
    const result = await call("POST", "/company/tasks", { json: { title: "No parents" } });
    expect(result.status).toBe(422);
    const missing = result.body.detail.map((problem: { loc: string[] }) => problem.loc[1]).sort();
    expect(missing).toEqual(["product_id", "project_id"]);
  });

  test("a task for an unknown project is 404", async () => {
    const result = await createTask("__missing__");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ detail: "Project not found" });
  });

  test("a transition needs a reason", async () => {
    const task = await createTask(activeProjectId);
    const result = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "ready" },
    });
    expect(result.status).toBe(422);
    expect(result.body.detail[0]).toMatchObject({ type: "missing", loc: ["body", "reason"] });
  });

  test("a transition target outside the task states is 422", async () => {
    const task = await createTask(activeProjectId);
    const result = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "shipped", reason: "x" },
    });
    expect(result.status).toBe(422);
    expect(result.body.detail[0].type).toBe("literal_error");
  });

  test("review and completion are refused before any attempt", async () => {
    const task = await createTask(activeProjectId);
    const review = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "in_review", reason: "x" },
    });
    expect(review.status).toBe(409);
    expect(review.body).toEqual({ detail: "Review requires a previous Task attempt" });
    const done = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "done", reason: "x" },
    });
    expect(done.status).toBe(409);
    expect(done.body).toEqual({ detail: "Completion requires a previous Task attempt" });
  });

  test("a task cannot become ready until its project is approved", async () => {
    const task = await createTask(proposedProjectId);
    const result = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "ready", reason: "Groomed" },
    });
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      detail: "Project approval is required before creating Tasks outside Backlog or moving them to Ready",
    });
  });

  test("in an approved project a task moves to ready and the transition is recorded", async () => {
    const task = await createTask(activeProjectId);
    const ready = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "ready", reason: "Groomed" },
    });
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");
    expect(ready.body.transitions).toHaveLength(1);
    expect(ready.body.transitions[0]).toMatchObject({ from: "backlog", target: "ready", reason: "Groomed" });
    expect(ready.body.updated_at).toBeNumber();
  });

  test("cancelling updates the task and the product counts", async () => {
    const product = (await call("POST", "/company/products", { json: { name: unique("counts") } })).body;
    const project = (await call("POST", "/company/projects", { json: { product_id: product.id, name: "P" } }))
      .body;
    const task = await call("POST", "/company/tasks", {
      json: { product_id: product.id, project_id: project.id, title: "T" },
    });
    expect((await call("GET", `/company/products/${product.id}`)).body.counts.tasks.backlog).toBe(1);

    const cancelled = await call("POST", `/company/tasks/${task.body.id}/transitions`, {
      json: { target: "cancelled", reason: "Not needed" },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.allowed_transitions.map((option: { target: string }) => option.target)).toEqual([
      "backlog",
      "ready",
      "in_progress",
      "in_review",
      "done",
    ]);
    const counts = (await call("GET", `/company/products/${product.id}`)).body.counts.tasks;
    expect(counts).toMatchObject({ backlog: 0, cancelled: 1 });
  });

  test("tasks are filtered by project and status", async () => {
    const product = (await call("POST", "/company/products", { json: { name: unique("filter") } })).body;
    const project = (await call("POST", "/company/projects", { json: { product_id: product.id, name: "P" } }))
      .body;
    const make = () =>
      call("POST", "/company/tasks", {
        json: { product_id: product.id, project_id: project.id, title: unique("t") },
      });
    const [first, second] = [await make(), await make()];
    await call("POST", `/company/tasks/${second.body.id}/transitions`, {
      json: { target: "cancelled", reason: "x" },
    });

    const byProject = await call("GET", `/company/tasks?project_id=${project.id}`);
    expect(byProject.body.meta.total_count).toBe(2);
    const cancelled = await call("GET", `/company/tasks?product_id=${product.id}&status=cancelled`);
    expect(cancelled.body.data.map((task: { id: string }) => task.id)).toEqual([second.body.id]);
    const backlog = await call("GET", `/company/tasks?product_id=${product.id}&status=backlog`);
    expect(backlog.body.data.map((task: { id: string }) => task.id)).toEqual([first.body.id]);
  });

  test("a task can be edited, archived and restored, and lists its runs", async () => {
    const task = await createTask(activeProjectId);
    const patched = await call("PATCH", `/company/tasks/${task.body.id}`, { json: { title: "Renamed" } });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Renamed");

    const runs = await call("GET", `/company/tasks/${task.body.id}/runs`);
    expect(runs.status).toBe(200);
    expect(runs.body.data).toEqual([]);

    expect((await call("DELETE", `/company/tasks/${task.body.id}`)).status).toBe(204);
    const gone = await call("GET", `/company/tasks/${task.body.id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ detail: "Task not found" });
    const restored = await call("POST", `/company/tasks/${task.body.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.title).toBe("Renamed");
  });
});
