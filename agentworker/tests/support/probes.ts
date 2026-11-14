import type { Operation } from "@agentworker/contract";

export const MISSING_ID = "__missing__";

/** The request the operation probe sends: every path parameter filled with an id nothing has. */
export function probePath(operation: Operation): string {
  return operation.path.replace(/\{[^}]+\}/g, MISSING_ID);
}

export interface ProbeRecord {
  status: number;
  /** The error message, when the reference answered `{"detail": "<string>"}`. */
  detail?: string;
  contentType: string | null;
}

export function probeKey(operation: Operation): string {
  return `${operation.method} ${operation.path}`;
}
