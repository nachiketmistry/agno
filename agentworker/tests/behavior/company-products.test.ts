import { describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

const EMPTY_TASK_COUNTS = { backlog: 0, ready: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0 };

describe("CompanyOS products and projects", () => {
  test("a product is created with counts and the default archive window", async () => {
    const name = unique("product");
    const created = await call("POST", "/company/products", { json: { name, purpose: "Ship it" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name,
      purpose: "Ship it",
      user_id: null,
      metadata: { archive_window_days: 14 },
      counts: { projects: 0, tasks: EMPTY_TASK_COUNTS },
      updated_at: null,
      deleted_at: null,
    });
    expect(created.body.id).toBeString();
    expect(created.body.created_at).toBeNumber();

    const fetched = await call("GET", `/company/products/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  test("a product needs a non-empty name", async () => {
    const result = await call("POST", "/company/products", { json: { name: "" } });
    expect(result.status).toBe(422);
    expect(result.body.detail[0]).toMatchObject({ type: "string_too_short", loc: ["body", "name"] });
  });

  test("two products may share a name", async () => {
    const name = unique("twin");
    const first = await call("POST", "/company/products", { json: { name } });
    const second = await call("POST", "/company/products", { json: { name } });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.id).not.toBe(second.body.id);
  });

  test("editing a product sets updated_at", async () => {
    const created = await call("POST", "/company/products", { json: { name: unique("edit") } });
    const patched = await call("PATCH", `/company/products/${created.body.id}`, {
      json: { purpose: "New purpose" },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.purpose).toBe("New purpose");
    expect(patched.body.updated_at).toBeNumber();
  });

  test("products list is paginated with data and meta", async () => {
    await call("POST", "/company/products", { json: { name: unique("page") } });
    const page = await call("GET", "/company/products?limit=1&page=1");
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 1, limit: 1 });
    expect(page.body.meta.total_count).toBeGreaterThanOrEqual(1);
    expect(page.body.meta.total_pages).toBe(page.body.meta.total_count);
  });

  test("archiving hides a product and restore brings it back", async () => {
    const created = await call("POST", "/company/products", { json: { name: unique("archive") } });
    const id = created.body.id;
    expect((await call("DELETE", `/company/products/${id}`)).status).toBe(204);
    const gone = await call("GET", `/company/products/${id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ detail: "Product not found" });
    const listed = await call("GET", "/company/products?limit=100");
    expect(listed.body.data.map((product: { id: string }) => product.id)).not.toContain(id);

    const restored = await call("POST", `/company/products/${id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.deleted_at).toBeNull();
    expect((await call("GET", `/company/products/${id}`)).status).toBe(200);
  });

  test("a project starts as proposed and belongs to a product", async () => {
    const product = await call("POST", "/company/products", { json: { name: unique("with-project") } });
    const project = await call("POST", "/company/projects", {
      json: { product_id: product.body.id, name: "Release" },
    });
    expect(project.status).toBe(201);
    expect(project.body).toMatchObject({
      product_id: product.body.id,
      name: "Release",
      status: "proposed",
      outcome: null,
      target_date: null,
      transitions: [],
      counts: { tasks: EMPTY_TASK_COUNTS },
    });
    const counted = await call("GET", `/company/products/${product.body.id}`);
    expect(counted.body.counts.projects).toBe(1);
  });

  test("a project for an unknown product is 404", async () => {
    const result = await call("POST", "/company/projects", {
      json: { product_id: "__missing__", name: "Release" },
    });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ detail: "Product not found" });
  });

  test("approving a project records the transition; going back is refused", async () => {
    const product = await call("POST", "/company/products", { json: { name: unique("approve") } });
    const project = await call("POST", "/company/projects", {
      json: { product_id: product.body.id, name: "Release" },
    });
    const approved = await call("POST", `/company/projects/${project.body.id}/transitions`, {
      json: { target: "active", reason: "Approved in planning" },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("active");
    expect(approved.body.transitions).toHaveLength(1);
    expect(approved.body.transitions[0]).toMatchObject({
      from: "proposed",
      target: "active",
      reason: "Approved in planning",
    });

    const back = await call("POST", `/company/projects/${project.body.id}/transitions`, {
      json: { target: "proposed", reason: "Changed my mind" },
    });
    expect(back.status).toBe(409);
    expect(back.body).toEqual({ detail: "Invalid project transition from active to proposed" });
  });

  test("a project can be edited, archived and restored", async () => {
    const product = await call("POST", "/company/products", { json: { name: unique("project-life") } });
    const project = await call("POST", "/company/projects", {
      json: { product_id: product.body.id, name: "Release" },
    });
    const patched = await call("PATCH", `/company/projects/${project.body.id}`, {
      json: { outcome: "Shipped" },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.outcome).toBe("Shipped");
    expect((await call("DELETE", `/company/projects/${project.body.id}`)).status).toBe(204);
    expect((await call("GET", `/company/projects/${project.body.id}`)).status).toBe(404);
    const restored = await call("POST", `/company/projects/${project.body.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.deleted_at).toBeNull();
  });

  test("company details use optimistic concurrency", async () => {
    const details = await call("GET", "/company/details");
    expect(details.status).toBe(200);
    expect(details.body).toMatchObject({ id: "company", name: "Company" });

    const missing = await call("PATCH", "/company/details", { json: { description: "x" } });
    expect(missing.status).toBe(422);
    expect(missing.body.detail[0].loc).toEqual(["body", "expected_updated_at"]);

    const stale = await call("PATCH", "/company/details", {
      json: { description: "x", expected_updated_at: 1 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ detail: "Company details changed. Reload before saving your edits." });

    expect((await call("GET", "/company/details/access")).body).toEqual({ can_edit: true });
  });

  test("attention counts are reported", async () => {
    const result = await call("GET", "/company/attention");
    expect(result.status).toBe(200);
    expect(Object.keys(result.body).sort()).toEqual(["failed", "in_review", "proposals"]);
  });
});
