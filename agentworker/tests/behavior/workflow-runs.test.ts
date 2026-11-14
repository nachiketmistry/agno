import { describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

/** The `echo-flow` workflow needs no model, so its runs are deterministic. */
describe("workflow runs", () => {
  test("a non-streaming run returns the completed run as JSON", async () => {
    const sessionId = unique("session");
    const run = await call("POST", "/workflows/echo-flow/runs", {
      form: { message: "hi", stream: "false", session_id: sessionId },
    });
    expect(run.status).toBe(200);
    expect(run.headers.get("content-type")).toBe("application/json");
    expect(run.body).toMatchObject({
      input: "hi",
      content: "echo: hi",
      content_type: "str",
      workflow_id: "echo-flow",
      workflow_name: "Echo flow",
      session_id: sessionId,
      status: "COMPLETED",
    });
    expect(run.body.run_id).toBeString();
    expect(run.body.step_results).toHaveLength(1);
    expect(run.body.step_results[0]).toMatchObject({
      content: "echo: hi",
      step_name: "Echo",
      step_type: "Step",
      executor_type: "function",
      executor_name: "echo",
      success: true,
      error: null,
    });
  });

  test("a run needs a message and a known workflow", async () => {
    const noMessage = await call("POST", "/workflows/echo-flow/runs", { form: { stream: "false" } });
    expect(noMessage.status).toBe(422);
    expect(noMessage.body.detail[0]).toMatchObject({ type: "missing", loc: ["body", "message"] });
    const unknown = await call("POST", "/workflows/__missing__/runs", {
      form: { message: "hi", stream: "false" },
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ detail: "Workflow not found" });
  });

  test("a streaming run sends server-sent events in order", async () => {
    const run = await call("POST", "/workflows/echo-flow/runs", { form: { message: "hi", stream: "true" } });
    expect(run.status).toBe(200);
    expect(run.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");

    const frames = run.text.split("\n\n").filter(Boolean);
    const events = frames.map((frame) => {
      const [eventLine, dataLine] = frame.split("\n");
      expect(eventLine).toStartWith("event: ");
      expect(dataLine).toStartWith("data: ");
      return { name: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) };
    });
    expect(events.map((event) => event.name)).toEqual([
      "WorkflowStarted",
      "StepStarted",
      "StepOutput",
      "StepCompleted",
      "WorkflowCompleted",
    ]);
    for (const event of events) {
      expect(event.data.event).toBe(event.name);
      expect(event.data.workflow_id).toBe("echo-flow");
      expect(event.data.run_id).toBe(events[0]!.data.run_id);
      expect(event.data.session_id).toBe(events[0]!.data.session_id);
    }
    expect(events[1]!.data).toMatchObject({ step_name: "Echo", step_index: 0 });
    expect(events[4]!.data).toMatchObject({ content: "echo: hi", content_type: "str" });
    // Compact JSON, one data line per event: the control plane parses it line by line.
    expect(frames[0]).not.toContain(': {"created_at": ');
  });

  test("a run is stored: the session, its runs and the run itself can be read back", async () => {
    const sessionId = unique("session");
    const run = await call("POST", "/workflows/echo-flow/runs", {
      form: { message: "remember me", stream: "false", session_id: sessionId },
    });

    const session = await call("GET", `/sessions/${sessionId}?type=workflow`);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({
      session_id: sessionId,
      workflow_id: "echo-flow",
      session_name: "remember me",
    });

    const runs = await call("GET", `/sessions/${sessionId}/runs?type=workflow`);
    expect(runs.status).toBe(200);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0]).toMatchObject({
      run_id: run.body.run_id,
      run_input: "remember me",
      content: "echo: remember me",
      status: "COMPLETED",
    });

    const fetched = await call("GET", `/workflows/echo-flow/runs/${run.body.run_id}?session_id=${sessionId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ run_id: run.body.run_id, content: "echo: remember me" });

    const listed = await call("GET", "/sessions?type=workflow&limit=100");
    const row = listed.body.data.find((item: { session_id: string }) => item.session_id === sessionId);
    expect(row).toMatchObject({
      session_type: "workflow",
      workflow_id: "echo-flow",
      session_name: "remember me",
    });
  });

  test("two runs in one session are kept in order", async () => {
    const sessionId = unique("session");
    await call("POST", "/workflows/echo-flow/runs", {
      form: { message: "one", stream: "false", session_id: sessionId },
    });
    await call("POST", "/workflows/echo-flow/runs", {
      form: { message: "two", stream: "false", session_id: sessionId },
    });
    const runs = await call("GET", `/sessions/${sessionId}/runs?type=workflow`);
    expect(runs.body.map((item: { run_input: string }) => item.run_input)).toEqual(["one", "two"]);
  });

  test("a session can be renamed and deleted", async () => {
    const sessionId = unique("session");
    await call("POST", "/workflows/echo-flow/runs", {
      form: { message: "hi", stream: "false", session_id: sessionId },
    });
    const renamed = await call("POST", `/sessions/${sessionId}/rename?type=workflow`, {
      json: { session_name: "Renamed" },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.session_name).toBe("Renamed");
    expect((await call("DELETE", `/sessions/${sessionId}`)).status).toBe(204);
    const gone = await call("GET", `/sessions/${sessionId}?type=workflow`);
    expect(gone.status).toBe(404);
  });
});
