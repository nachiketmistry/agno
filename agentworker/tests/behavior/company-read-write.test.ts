import { describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

describe("CompanyOS single-record reads and shared pages", () => {
  test("a project, a task and a routine are read back by id", async () => {
    const product = (await call("POST", "/company/products", { json: { name: unique("reads") } })).body;
    const project = (
      await call("POST", "/company/projects", { json: { product_id: product?.id, name: "P" } })
    ).body;
    const task = (
      await call("POST", "/company/tasks", {
        json: { product_id: product?.id, project_id: project?.id, title: "T" },
      })
    ).body;
    const routine = (
      await call("POST", "/company/routines", {
        json: { product_id: product?.id, name: "R", instructions: "Do" },
      })
    ).body;

    const readProject = await call("GET", `/company/projects/${project?.id}`);
    expect(readProject.status).toBe(200);
    expect(readProject.body).toMatchObject({ id: project.id, name: "P", counts: { tasks: { backlog: 1 } } });
    const readTask = await call("GET", `/company/tasks/${task.id}`);
    expect(readTask.status).toBe(200);
    expect(readTask.body).toEqual(task);
    const readRoutine = await call("GET", `/company/routines/${routine.id}`);
    expect(readRoutine.status).toBe(200);
    expect(readRoutine.body.id).toBe(routine.id);
  });

  test("company details are saved when the expected version matches", async () => {
    const before = (await call("GET", "/company/details")).body;
    const description = unique("About us");
    const saved = await call("PATCH", "/company/details", {
      json: { description, expected_updated_at: before?.updated_at },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ id: "company", description });
    expect(saved.body.updated_at).toBeGreaterThanOrEqual(before.updated_at);
  });

  test("a company wiki page is written and read back", async () => {
    const path = `/company/wiki/notes/${unique("page")}.md`;
    const written = await call("PUT", path, { json: { content: "Shared note", expected_version: 0 } });
    expect(written.status).toBe(200);
    expect(written.body).toMatchObject({ version: 1, size_bytes: 11 });
    expect((await call("GET", path)).body.content).toBe("Shared note");
  });

  test("setup is refused once the deployment has products", async () => {
    await call("POST", "/company/products", { json: { name: unique("existing") } });
    const result = await call("POST", "/company/setup", { json: { name: unique("setup") } });
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ detail: "Company setup requires a deployment without Products" });
  });
});
