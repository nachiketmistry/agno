import { notImplemented } from "./not-implemented";

export const MINI_AGENT_ID = "miniagent";

export type ExecutorType = "agent" | "team" | "workflow";
export type TaskStatus = "backlog" | "ready" | "in_progress" | "in_review" | "done" | "cancelled";
export const TASK_STATUSES: readonly TaskStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];
/** An accepted Task is open until it is Done or Cancelled. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ["ready", "in_progress", "in_review"];

export interface AutoAccept {
  default_executor: string;
  executors: string[] | null;
  source_ids: string[] | null;
  work_scope: { product_ids?: string[] | null; project_ids?: (string | null)[] | null } | null;
  required_checks: string[];
  limits: { max_acceptances: number; expires_at: number } | null;
  complete_projects: boolean;
  approve_projects: boolean;
  max_open: number;
}

export interface Routine {
  name: string;
  template: "refresh" | "intake" | "summary" | null;
  executor_type: ExecutorType;
  executor_id: string;
  cron_expr: string | null;
  timezone: string;
  enabled: boolean;
  instructions: string | null;
  auto_accept: false | AutoAccept;
}

export interface TaskLike {
  status: TaskStatus;
  executor_type?: ExecutorType | null;
  executor_id?: string | null;
  job_id?: string | null;
  transitions?: Record<string, unknown>[] | null;
}

export interface AllowedTransition {
  target: TaskStatus;
  allowed: boolean;
  reason: string | null;
  starts_run: boolean;
}

export class CompanyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyValidationError";
  }
}

/** Validate an AutoAccept policy and fill every default. `true` is the default policy. */
export function parseAutoAccept(_input: unknown): false | AutoAccept {
  return notImplemented("parseAutoAccept");
}

/** Validate a Routine declaration and fill defaults; throws CompanyValidationError. */
export function parseRoutine(_input: unknown): Routine {
  return notImplemented("parseRoutine");
}

/** The message a Routine run starts with: the Product boundary, a blank line, the instructions. */
export function routineMessage(_productId: string, _instructions: string): string {
  return notImplemented("routineMessage");
}

/** The error a move to `target` raises, or null when the Task allows it. */
export function taskTransitionBlocker(
  _task: TaskLike,
  _target: TaskStatus,
  _runHolding = false,
): string | null {
  return notImplemented("taskTransitionBlocker");
}

/** The transitions a client may offer for a Task, in the order the API returns them. */
export function allowedTransitions(_task: TaskLike): AllowedTransition[] {
  return notImplemented("allowedTransitions");
}

/** Whether an intake proposal with this key already exists among a Product's Tasks. */
export function isDuplicateProposal(_existingKeys: Iterable<string>, _proposalKey: string): boolean {
  return notImplemented("isDuplicateProposal");
}
