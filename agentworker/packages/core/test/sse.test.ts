import { describe, expect, test } from "bun:test";
import { formatSseEvent, formatSseEventWithIndex, parseSseStream } from "../src";

describe("SSE frames", () => {
  test("a frame is the event name, compact JSON and a blank line", () => {
    expect(formatSseEvent({ event: "RunStarted", run_id: "r1", created_at: 1 })).toBe(
      'event: RunStarted\ndata: {"event":"RunStarted","run_id":"r1","created_at":1}\n\n',
    );
  });
  test("newlines inside values stay escaped so a frame is one data line", () => {
    const frame = formatSseEvent({ event: "RunContent", content: "a\nb" });
    expect(frame.split("\n")).toHaveLength(4);
    expect(frame).toContain('"content":"a\\nb"');
  });
  test("an event without a name is sent as message", () => {
    expect(formatSseEvent({ event: "" })).toStartWith("event: message\n");
  });
  test("event_index is injected for reconnection", () => {
    const frame = formatSseEventWithIndex({ event: "RunContent", run_id: "r1" }, 7);
    expect(JSON.parse(frame.split("data: ")[1]!)).toEqual({
      event: "RunContent",
      run_id: "r1",
      event_index: 7,
    });
  });
  test("run_id is injected only when the event has none", () => {
    expect(JSON.parse(formatSseEventWithIndex({ event: "X" }, 0, "r9").split("data: ")[1]!).run_id).toBe(
      "r9",
    );
    expect(
      JSON.parse(formatSseEventWithIndex({ event: "X", run_id: "r1" }, 0, "r9").split("data: ")[1]!).run_id,
    ).toBe("r1");
  });
  test("event_index 0 is kept", () => {
    expect(formatSseEventWithIndex({ event: "X" }, 0)).toContain('"event_index":0');
  });
  test("a stream parses back into its events and skips heartbeats", () => {
    const body = `${formatSseEvent({ event: "WorkflowStarted", run_id: "r1" })}: heartbeat\n\n${formatSseEvent({ event: "WorkflowCompleted", run_id: "r1" })}`;
    expect(parseSseStream(body).map((event) => event.event)).toEqual([
      "WorkflowStarted",
      "WorkflowCompleted",
    ]);
  });
  test("an empty stream has no events", () => expect(parseSseStream("")).toEqual([]));
});
