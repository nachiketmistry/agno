import { notImplemented } from "./not-implemented";

/** True for a five-field cron expression the scheduler can run. */
export function validateCronExpr(_expr: string): boolean {
  return notImplemented("validateCronExpr");
}

/** True for an IANA time zone name. */
export function validateTimezone(_timezone: string): boolean {
  return notImplemented("validateTimezone");
}

/** Epoch seconds of the first fire time strictly after `afterEpochSeconds`. */
export function computeNextRun(_expr: string, _timezone: string, _afterEpochSeconds: number): number {
  return notImplemented("computeNextRun");
}
