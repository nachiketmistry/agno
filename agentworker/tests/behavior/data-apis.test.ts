import { describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

describe("memories", () => {
  test("a memory is created, read, edited, listed and bulk deleted", async () => {
    const userId = unique("user");
    const created = await call("POST", "/memories", {
      json: { memory: "Likes tea", topics: ["drinks"], user_id: userId },
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      memory: "Likes tea",
      topics: ["drinks"],
      user_id: userId,
      agent_id: null,
      team_id: null,
    });
    const id = created.body.memory_id;

    expect((await call("GET", `/memories/${id}?user_id=${userId}`)).body.memory).toBe("Likes tea");
    const patched = await call("PATCH", `/memories/${id}`, {
      json: { memory: "Likes coffee", topics: ["drinks"], user_id: userId },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.memory).toBe("Likes coffee");

    const listed = await call("GET", `/memories?user_id=${userId}`);
    expect(listed.body.meta.total_count).toBe(1);
    expect(listed.body.data[0].memory_id).toBe(id);
    expect((await call("GET", "/memory_topics")).body).toContain("drinks");
    const stats = await call("GET", "/user_memory_stats?limit=100");
    expect(stats.body.data.find((row: { user_id: string }) => row.user_id === userId)).toMatchObject({
      total_memories: 1,
    });

    expect((await call("DELETE", "/memories", { json: { memory_ids: [id], user_id: userId } })).status).toBe(
      204,
    );
    const gone = await call("GET", `/memories/${id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ detail: `Memory with ID ${id} not found` });
  });

  test("a single memory is deleted by id", async () => {
    const created = await call("POST", "/memories", {
      json: { memory: "Temporary", user_id: unique("user") },
    });
    expect((await call("DELETE", `/memories/${created.body.memory_id}`)).status).toBe(204);
  });
});

describe("sessions", () => {
  test("an empty agent session is created, edited, searched and bulk deleted", async () => {
    const created = await call("POST", "/sessions?type=agent", {
      json: {
        agent_id: "assistant",
        session_name: "Planning",
        session_state: { step: 1 },
        user_id: "user-1",
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      agent_id: "assistant",
      session_name: "Planning",
      session_state: { step: 1 },
      user_id: "user-1",
      chat_history: [],
    });
    const id = created.body.session_id;
    expect(created.body.agent_session_id).toBe(id);

    const duplicate = await call("POST", "/sessions?type=agent", {
      json: { agent_id: "assistant", session_id: id },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({
      detail: `Session with id '${id}' already exists. Use PATCH /sessions/${id} to update it.`,
    });

    const patched = await call("PATCH", `/sessions/${id}?type=agent`, {
      json: { session_name: "Renamed", metadata: { team: "core" } },
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      session_name: "Renamed",
      metadata: { team: "core" },
      session_state: { step: 1 },
    });

    const found = await call("POST", "/sessions/search", {
      json: { session_type: "agent", limit: 5, filter: { op: "EQ", key: "session_id", value: id } },
    });
    expect(found.status).toBe(200);
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0]).toMatchObject({
      session_id: id,
      session_type: "agent",
      agent_id: "assistant",
    });

    for (const path of ["runs", "run-previews", "compactions"]) {
      const result = await call("GET", `/sessions/${id}/${path}?type=agent`);
      expect(result.status).toBe(200);
      expect(result.body).toEqual([]);
    }

    expect(
      (await call("DELETE", "/sessions", { json: { session_ids: [id], session_types: ["agent"] } })).status,
    ).toBe(204);
    expect((await call("GET", `/sessions/${id}?type=agent`)).status).toBe(404);
  });

  test("the session filter schema lists the searchable fields", async () => {
    const schema = await call("GET", "/sessions/filter-schema");
    expect(schema.status).toBe(200);
    expect(schema.body.fields.map((field: { key: string }) => field.key)).toContain("session_id");
  });
});

describe("components", () => {
  test("a component has versioned configs; a draft cannot be made current", async () => {
    const id = unique("component");
    const created = await call("POST", "/components", {
      json: { name: "Helper", component_type: "agent", component_id: id, config: { instructions: "v1" } },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ component_id: id, component_type: "agent", name: "Helper" });
    expect((await call("GET", `/components/${id}`)).body.component_id).toBe(id);

    const patched = await call("PATCH", `/components/${id}`, { json: { description: "Helps" } });
    expect(patched.body.description).toBe("Helps");

    const first = await call("GET", `/components/${id}/configs/current`);
    expect(first.body).toMatchObject({ version: 1, stage: "draft", config: { instructions: "v1" } });
    const second = await call("POST", `/components/${id}/configs`, {
      json: { config: { instructions: "v2" } },
    });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ version: 2, stage: "draft" });
    expect(
      (await call("GET", `/components/${id}/configs`)).body
        .map((config: { version: number }) => config.version)
        .sort(),
    ).toEqual([1, 2]);
    expect((await call("GET", `/components/${id}/configs/2`)).body.config).toEqual({ instructions: "v2" });
    expect(
      (await call("PATCH", `/components/${id}/configs/2`, { json: { notes: "second" } })).body.notes,
    ).toBe("second");

    const current = await call("POST", `/components/${id}/configs/2/set-current`);
    expect(current.status).toBe(400);
    expect(current.body).toEqual({
      detail: `Cannot set draft config ${id} v2 as current. Only published configs can be current.`,
    });

    expect((await call("DELETE", `/components/${id}/configs/1`)).status).toBe(204);
    expect((await call("DELETE", `/components/${id}`)).status).toBe(204);
    expect((await call("GET", `/components/${id}`)).status).toBe(404);
    expect((await call("POST", `/components/${id}/restore`)).status).toBe(200);
    await call("DELETE", `/components/${id}`);
  });

  test("a published config can be made current", async () => {
    const id = unique("component");
    await call("POST", "/components", {
      json: { name: "Helper", component_type: "agent", component_id: id, config: { instructions: "v1" } },
    });
    const published = await call("POST", `/components/${id}/configs`, {
      json: { config: { instructions: "v2" }, stage: "published" },
    });
    expect(published.status).toBe(201);
    const current = await call("POST", `/components/${id}/configs/${published.body.version}/set-current`);
    expect(current.status).toBe(200);
    expect((await call("GET", `/components/${id}/configs/current`)).body.version).toBe(
      published.body.version,
    );
    await call("DELETE", `/components/${id}`);
  });
});

describe("learnings", () => {
  test("a learning is created with an id derived from its type and user, then edited and deleted", async () => {
    const userId = unique("user");
    const created = await call("POST", "/learnings", {
      json: { learning_type: "user_profile", content: { name: "N" }, user_id: userId },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      learning_id: `user_profile_${userId}`,
      learning_type: "user_profile",
      content: { name: "N" },
    });
    const id = created.body.learning_id;
    expect((await call("GET", `/learnings/${id}`)).body.content).toEqual({ name: "N" });
    expect(
      (await call("PATCH", `/learnings/${id}`, { json: { content: { name: "M" } } })).body.content,
    ).toEqual({ name: "M" });
    expect((await call("DELETE", `/learnings/${id}`)).status).toBe(204);
    const gone = await call("GET", `/learnings/${id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ detail: "Learning not found" });
  });
});

describe("traces, evals and databases", () => {
  test("trace search answers a page", async () => {
    const result = await call("POST", "/traces/search", { json: { limit: 5 } });
    expect(result.status).toBe(200);
    expect(result.body.meta).toMatchObject({ page: 1, limit: 5 });
  });

  test("bulk deleting eval runs is 204 even when none match", async () => {
    expect((await call("DELETE", "/eval-runs", { json: { eval_run_ids: ["__missing__"] } })).status).toBe(
      204,
    );
  });

  test("a database listed in the config can be migrated", async () => {
    const config = await call("GET", "/config");
    const migrated = await call("POST", `/databases/${config.body?.databases?.[0]}/migrate`);
    expect(migrated.status).toBe(200);
    expect(migrated.body).toEqual({ message: "Database migrated successfully to latest version" });
  });
});

describe("stored workflow runs", () => {
  test("runs are listed per session and a finished run can be read from its session", async () => {
    const sessionId = unique("session");
    const run = await call("POST", "/workflows/echo-flow/runs", {
      form: { message: "hi", stream: "false", session_id: sessionId },
    });
    const listed = await call("GET", `/workflows/echo-flow/runs?session_id=${sessionId}`);
    expect(listed.status).toBe(200);
    expect(listed.body.map((item: { run_id: string }) => item.run_id)).toEqual([run.body.run_id]);

    const fromSession = await call("GET", `/sessions/${sessionId}/runs/${run.body.run_id}?type=workflow`);
    expect(fromSession.status).toBe(200);
    expect(fromSession.body).toMatchObject({ run_id: run.body.run_id, run_index: 0, content: "echo: hi" });

    const cancelled = await call("POST", `/workflows/echo-flow/runs/${run.body.run_id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({});
  });
});

describe("triggering a schedule", () => {
  // The reference polls the triggered run, so this call takes about 30 seconds there.
  test("a manual trigger calls the endpoint and records the run", async () => {
    const created = await call("POST", "/schedules", {
      json: {
        name: unique("trigger"),
        cron_expr: "0 3 * * *",
        endpoint: "/workflows/echo-flow/runs",
        method: "POST",
        payload: { message: "from schedule", stream: false },
      },
    });
    const triggered = await call("POST", `/schedules/${created.body?.id}/trigger`);
    expect(triggered.status).toBe(200);
    expect(triggered.body).toMatchObject({
      schedule_id: created.body.id,
      attempt: 1,
      status: "success",
      status_code: 200,
      error: null,
      output: { content: "echo: from schedule", content_type: "str" },
    });
    expect(triggered.body.id).toStartWith("sr_");

    const runs = await call("GET", `/schedules/${created.body.id}/runs`);
    expect(runs.body.data.map((item: { id: string }) => item.id)).toEqual([triggered.body.id]);
    const single = await call("GET", `/schedules/${created.body.id}/runs/${triggered.body.id}`);
    expect(single.status).toBe(200);
    expect(single.body.run_id).toBe(triggered.body.run_id);
    await call("DELETE", `/schedules/${created.body.id}`);
  }, 90_000);
});
