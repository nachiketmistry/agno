import { describe, expect, test } from "bun:test";
import taskCreated from "@agentworker/contract/fixtures/company_task_created.json";
import {
  CompanyValidationError,
  MINI_AGENT_ID,
  OPEN_TASK_STATUSES,
  TASK_STATUSES,
  type TaskLike,
  allowedTransitions,
  isDuplicateProposal,
  parseAutoAccept,
  parseRoutine,
  routineMessage,
  taskTransitionBlocker,
} from "../src";

describe("AutoAccept policy", () => {
  test("true is the policy with every default", () => {
    expect(parseAutoAccept(true)).toEqual({
      default_executor: "miniagent",
      executors: null,
      source_ids: null,
      work_scope: null,
      required_checks: ["executor_registered"],
      limits: null,
      complete_projects: false,
      approve_projects: true,
      max_open: 5,
    });
  });
  test("false stays false", () => expect(parseAutoAccept(false)).toBe(false));
  test("unknown fields are rejected", () =>
    expect(() => parseAutoAccept({ surprise: 1 })).toThrow(CompanyValidationError));
  test("max_open must be at least 1", () =>
    expect(() => parseAutoAccept({ max_open: 0 })).toThrow(CompanyValidationError));
  test("required_checks cannot be empty", () =>
    expect(() => parseAutoAccept({ required_checks: [] })).toThrow(CompanyValidationError));
  test("the saved executor shape allows that one executor and approves no project", () => {
    expect(parseAutoAccept({ executor_type: "workflow", executor_id: "draft" })).toMatchObject({
      default_executor: "draft",
      executors: ["draft"],
      approve_projects: false,
    });
  });
  test("one executor field without the other is an error", () =>
    expect(() => parseAutoAccept({ executor_id: "draft" })).toThrow(CompanyValidationError));
  test("executor_id and default_executor must agree when both are sent", () =>
    expect(() =>
      parseAutoAccept({ executor_type: "agent", executor_id: "a", default_executor: "b" }),
    ).toThrow(CompanyValidationError));
  test("limits need an expiry", () =>
    expect(() => parseAutoAccept({ limits: { max_acceptances: 3 } })).toThrow(CompanyValidationError));
});

describe("Routine declaration", () => {
  test("defaults to Mini Agent, UTC, enabled, no auto accept", () => {
    expect(parseRoutine({ name: "Weekly summary", instructions: "Summarize the week" })).toEqual({
      name: "Weekly summary",
      template: null,
      executor_type: "agent",
      executor_id: MINI_AGENT_ID,
      cron_expr: null,
      timezone: "UTC",
      enabled: true,
      instructions: "Summarize the week",
      auto_accept: false,
    });
  });
  test("instructions are required without a template", () =>
    expect(() => parseRoutine({ name: "x" })).toThrow(
      "Routine instructions are required without a template",
    ));
  test("a template needs no instructions", () =>
    expect(parseRoutine({ name: "Intake", template: "intake" }).template).toBe("intake"));
  test("blank instructions are rejected", () =>
    expect(() => parseRoutine({ name: "x", template: "intake", instructions: "  " })).toThrow(
      "Routine instructions must be nonempty",
    ));
  test("an invalid cron expression is rejected", () =>
    expect(() => parseRoutine({ name: "x", instructions: "do", cron_expr: "nope" })).toThrow(
      "Invalid cron expression",
    ));
  test("an invalid time zone is rejected", () =>
    expect(() => parseRoutine({ name: "x", instructions: "do", timezone: "Mars/Olympus" })).toThrow(
      "Invalid timezone",
    ));
  test("auto_accept true becomes the default policy", () =>
    expect(parseRoutine({ name: "x", template: "intake", auto_accept: true }).auto_accept).toMatchObject({
      max_open: 5,
    }));
  test("an executor needs both type and id", () =>
    expect(() => parseRoutine({ name: "x", instructions: "do", executor_id: "draft" })).toThrow(
      CompanyValidationError,
    ));
  test("names are 1 to 255 characters", () => {
    expect(() => parseRoutine({ name: "", instructions: "do" })).toThrow(CompanyValidationError);
    expect(() => parseRoutine({ name: "n".repeat(256), instructions: "do" })).toThrow(CompanyValidationError);
  });
  test("unknown fields are rejected", () =>
    expect(() => parseRoutine({ name: "x", instructions: "do", extra: true })).toThrow(
      CompanyValidationError,
    ));
  test("the run message states the Product boundary first", () => {
    expect(routineMessage("p-1", "Summarize the week")).toBe(
      'Operate only on Product "p-1".\n\nSummarize the week',
    );
  });
});

describe("Task lifecycle", () => {
  const backlog: TaskLike = { status: "backlog", transitions: [] };
  const accepted: TaskLike = {
    status: "ready",
    executor_type: "agent",
    executor_id: "miniagent",
    transitions: [],
  };

  test("statuses match the contract", () => {
    expect([...TASK_STATUSES]).toEqual(["backlog", "ready", "in_progress", "in_review", "done", "cancelled"]);
    expect([...OPEN_TASK_STATUSES]).toEqual(["ready", "in_progress", "in_review"]);
  });
  test("a new backlog Task offers the transitions the Python AgentOS returned", () => {
    expect(allowedTransitions(backlog)).toEqual(taskCreated.body.allowed_transitions as never);
  });
  test("only accepted work can be started", () =>
    expect(taskTransitionBlocker(backlog, "in_progress")).toBe("Only accepted work can be started"));
  test("accepted work can be started", () =>
    expect(taskTransitionBlocker(accepted, "in_progress")).toBeNull());
  test("starting needs a registered executor type", () =>
    expect(taskTransitionBlocker({ ...accepted, executor_type: null }, "in_progress")).toBe(
      "Select a registered agent, team or workflow executor",
    ));
  test("a revision needs a previous attempt", () =>
    expect(taskTransitionBlocker({ ...accepted, status: "in_review" }, "in_progress")).toBe(
      "A revision requires a previous Task attempt",
    ));
  test("review from backlog needs a previous attempt", () =>
    expect(taskTransitionBlocker(backlog, "in_review")).toBe("Review requires a previous Task attempt"));
  test("completion from backlog needs a previous attempt", () =>
    expect(taskTransitionBlocker(backlog, "done")).toBe("Completion requires a previous Task attempt"));
  test("an earlier attempt unlocks review and completion", () => {
    const attempted: TaskLike = { status: "ready", transitions: [{ attempt: 1 }] };
    expect(taskTransitionBlocker(attempted, "in_review")).toBeNull();
    expect(taskTransitionBlocker(attempted, "done")).toBeNull();
  });
  test("review follows in progress without an attempt record", () =>
    expect(taskTransitionBlocker({ status: "in_progress" }, "in_review")).toBeNull());
  test("a status cannot move to itself unless the table allows it", () =>
    expect(taskTransitionBlocker(backlog, "backlog")).toBe(
      "Invalid task transition from backlog to backlog",
    ));
  test("a running job holds the Task in progress", () =>
    expect(taskTransitionBlocker({ status: "in_progress", job_id: "j1" }, "ready", true)).toBe(
      "Cancel the run with POST /company/runs/j1/cancel to leave In progress",
    ));
  test("done can be cancelled or reopened", () => {
    expect(taskTransitionBlocker({ status: "done", transitions: [{ attempt: 1 }] }, "cancelled")).toBeNull();
    expect(taskTransitionBlocker({ status: "done", transitions: [{ attempt: 1 }] }, "backlog")).toBeNull();
  });
});

describe("intake dedupe", () => {
  test("a proposal key seen before is a duplicate", () => {
    expect(isDuplicateProposal(["a", "b"], "a")).toBe(true);
    expect(isDuplicateProposal(new Set(["a"]), "c")).toBe(false);
    expect(isDuplicateProposal([], "a")).toBe(false);
  });
});
